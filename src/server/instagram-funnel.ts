import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  instagramConnections,
  instagramFunnelLeads,
  instagramFunnelRules,
  instagramFunnels,
  instagramFunnelNodes,
  instagramFunnelEdges,
} from "@/db/schema";
import { requireOrgContext } from "@/server/session";
import { runFunnelTest } from "@/server/instagram-webhook";

// Contas conectadas via "Instagram Login" (sem Página do Facebook, nosso
// caso) usam o host graph.instagram.com, não graph.facebook.com — e esses
// endpoints são efetivamente sem versão (sem prefixo /vXX.X/ no caminho).
const BASE_URL = "https://graph.instagram.com";

// ── Conexão ──────────────────────────────────────────────────────────────

export interface InstagramConnectionRow {
  id: string;
  instagram_business_account_id: string;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

// Só devolve a conexão ativa — depois de "Desconectar" a linha continua no
// banco (active: false), mas a tela deve tratar isso como não conectado.
const _fetchInstagramConnection = createServerFn({ method: "GET" }).handler(async (): Promise<InstagramConnectionRow | null> => {
  const { organizationId } = await requireOrgContext();
  const row = await db.query.instagramConnections.findFirst({
    where: and(eq(instagramConnections.organizationId, organizationId), eq(instagramConnections.active, true)),
  });
  if (!row) return null;
  return {
    id: row.id,
    instagram_business_account_id: row.instagramBusinessAccountId,
    expires_at: row.expiresAt,
    active: row.active,
    created_at: row.createdAt,
  };
});

export async function fetchInstagramConnection(): Promise<InstagramConnectionRow | null> {
  return _fetchInstagramConnection();
}

// A conexão em si é feita pelo fluxo OAuth (/api/instagram/connect →
// /api/instagram/callback, ver instagram-oauth.ts) — aqui só desliga.
const _disconnectInstagram = createServerFn({ method: "POST" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  await db
    .update(instagramConnections)
    .set({ active: false })
    .where(eq(instagramConnections.organizationId, organizationId));
});

export async function disconnectInstagram(): Promise<void> {
  await _disconnectInstagram();
}

// ── Posts recentes (pra escolher na hora de criar uma regra) ─────────────

export interface InstagramPostRow {
  id: string;
  caption: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
}

const _fetchRecentInstagramPosts = createServerFn({ method: "GET" }).handler(async (): Promise<InstagramPostRow[]> => {
  const { organizationId } = await requireOrgContext();
  const connection = await db.query.instagramConnections.findFirst({
    where: and(eq(instagramConnections.organizationId, organizationId), eq(instagramConnections.active, true)),
  });
  if (!connection) throw new Error("Conecte o Instagram antes de criar uma regra.");

  const params = new URLSearchParams({
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink",
    limit: "25",
    access_token: connection.accessToken,
  });
  const res = await fetch(`${BASE_URL}/${connection.instagramBusinessAccountId}/media?${params}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ao buscar posts do Instagram (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string }>;
  };
  return (json.data ?? []).map((p) => ({
    id: p.id,
    caption: p.caption ?? null,
    // Vídeo/reel só expõe imagem de capa em thumbnail_url; foto expõe media_url direto.
    thumbnail_url: (p.media_type === "VIDEO" || p.media_type === "REELS" ? p.thumbnail_url : p.media_url) ?? null,
    permalink: p.permalink ?? null,
  }));
});

export async function fetchRecentInstagramPosts(): Promise<InstagramPostRow[]> {
  return _fetchRecentInstagramPosts();
}

// ── Regras ───────────────────────────────────────────────────────────────

export interface FunnelRuleRow {
  id: string;
  trigger_type: "comment" | "story_reply";
  post_id: string | null;
  post_thumbnail_url: string | null;
  post_permalink: string | null;
  keyword: string;
  message: string | null;
  public_reply: string | null;
  funnel_id: string | null;
  active: boolean;
  require_follow: boolean;
  created_at: string;
}

const _fetchFunnelRules = createServerFn({ method: "GET" }).handler(async (): Promise<FunnelRuleRow[]> => {
  const { organizationId } = await requireOrgContext();
  const rows = await db
    .select()
    .from(instagramFunnelRules)
    .where(eq(instagramFunnelRules.organizationId, organizationId))
    .orderBy(desc(instagramFunnelRules.createdAt));
  return rows.map((r) => ({
    id: r.id,
    trigger_type: r.triggerType as "comment" | "story_reply",
    post_id: r.postId,
    post_thumbnail_url: r.postThumbnailUrl,
    post_permalink: r.postPermalink,
    keyword: r.keyword,
    message: r.message,
    public_reply: r.publicReply,
    funnel_id: r.funnelId,
    active: r.active,
    require_follow: r.requireFollow,
    created_at: r.createdAt,
  }));
});

export async function fetchFunnelRules(): Promise<FunnelRuleRow[]> {
  return _fetchFunnelRules();
}

// Regra nova sempre exige um funil — a 1ª mensagem e o resto da conversa
// vêm do bloco Gatilho dele pra frente. `message` só existe mais pra regra
// antiga (criada antes dessa mudança, sem funil vinculado) via updateRuleSchema.
const createRuleSchema = z.object({
  trigger_type: z.enum(["comment", "story_reply"]),
  post_id: z.string().nullable().optional(),
  post_thumbnail_url: z.string().nullable().optional(),
  post_permalink: z.string().nullable().optional(),
  keyword: z.string().min(1),
  public_reply: z.string().nullable().optional(),
  funnel_id: z.string().min(1),
  require_follow: z.boolean().optional(),
}).refine((data) => data.trigger_type !== "comment" || !!data.post_id, {
  message: "post_id é obrigatório pra regra de comentário.",
  path: ["post_id"],
});

const _createFunnelRule = createServerFn({ method: "POST" })
  .inputValidator(createRuleSchema)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const isComment = data.trigger_type === "comment";
    await db.insert(instagramFunnelRules).values({
      organizationId,
      triggerType: data.trigger_type,
      postId: isComment ? data.post_id : null,
      postThumbnailUrl: isComment ? (data.post_thumbnail_url ?? null) : null,
      postPermalink: isComment ? (data.post_permalink ?? null) : null,
      keyword: data.keyword.trim(),
      message: null,
      // Resposta pública não existe pra story — só faz sentido em comentário.
      publicReply: isComment ? data.public_reply?.trim() || null : null,
      funnelId: data.funnel_id,
      requireFollow: data.require_follow ?? false,
    });
  });

export async function createFunnelRule(payload: {
  trigger_type: "comment" | "story_reply";
  post_id?: string | null;
  post_thumbnail_url?: string | null;
  post_permalink?: string | null;
  keyword: string;
  public_reply?: string | null;
  funnel_id: string;
  require_follow?: boolean;
}): Promise<void> {
  await _createFunnelRule({ data: payload });
}

const updateRuleSchema = z.object({
  id: z.string(),
  keyword: z.string().min(1),
  // Só enviado (não-undefined) pra regra antiga, sem funil — regra com
  // funil não tem mais campo de mensagem própria pra editar.
  message: z.string().nullable().optional(),
  public_reply: z.string().nullable().optional(),
  funnel_id: z.string().nullable().optional(),
  require_follow: z.boolean().optional(),
});

const _updateFunnelRule = createServerFn({ method: "POST" })
  .inputValidator(updateRuleSchema)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const existing = await db.query.instagramFunnelRules.findFirst({
      where: and(eq(instagramFunnelRules.id, data.id), eq(instagramFunnelRules.organizationId, organizationId)),
    });
    if (!existing) throw new Error("Regra não encontrada.");
    await db
      .update(instagramFunnelRules)
      .set({
        keyword: data.keyword.trim(),
        ...(data.message !== undefined ? { message: data.message?.trim() || null } : {}),
        // Resposta pública não existe pra story, mesmo que venha preenchida.
        publicReply: existing.triggerType === "comment" ? data.public_reply?.trim() || null : null,
        funnelId: data.funnel_id ?? null,
        requireFollow: data.require_follow ?? false,
      })
      .where(and(eq(instagramFunnelRules.id, data.id), eq(instagramFunnelRules.organizationId, organizationId)));
  });

export async function updateFunnelRule(payload: {
  id: string;
  keyword: string;
  message?: string | null;
  public_reply?: string | null;
  funnel_id?: string | null;
  require_follow?: boolean;
}): Promise<void> {
  await _updateFunnelRule({ data: payload });
}

const _toggleFunnelRule = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db
      .update(instagramFunnelRules)
      .set({ active: data.active })
      .where(and(eq(instagramFunnelRules.id, data.id), eq(instagramFunnelRules.organizationId, organizationId)));
  });

export async function toggleFunnelRule(id: string, active: boolean): Promise<void> {
  await _toggleFunnelRule({ data: { id, active } });
}

const _deleteFunnelRule = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db
      .delete(instagramFunnelRules)
      .where(and(eq(instagramFunnelRules.id, data.id), eq(instagramFunnelRules.organizationId, organizationId)));
  });

export async function deleteFunnelRule(id: string): Promise<void> {
  await _deleteFunnelRule({ data: { id } });
}

// ── Leads capturados ───────────────────────────────────────────────────────

export interface FunnelLeadRow {
  id: string;
  rule_keyword: string;
  post_permalink: string | null;
  ig_username: string | null;
  ig_user_id: string;
  comment_text: string;
  status: "sent" | "failed";
  error_message: string | null;
  created_at: string;
}

const _fetchFunnelLeads = createServerFn({ method: "GET" }).handler(async (): Promise<FunnelLeadRow[]> => {
  const { organizationId } = await requireOrgContext();
  const rows = await db
    .select({
      id: instagramFunnelLeads.id,
      ruleKeyword: instagramFunnelRules.keyword,
      postPermalink: instagramFunnelRules.postPermalink,
      igUsername: instagramFunnelLeads.igUsername,
      igUserId: instagramFunnelLeads.igUserId,
      commentText: instagramFunnelLeads.commentText,
      status: instagramFunnelLeads.status,
      errorMessage: instagramFunnelLeads.errorMessage,
      createdAt: instagramFunnelLeads.createdAt,
    })
    .from(instagramFunnelLeads)
    .innerJoin(instagramFunnelRules, eq(instagramFunnelRules.id, instagramFunnelLeads.ruleId))
    .where(eq(instagramFunnelRules.organizationId, organizationId))
    .orderBy(desc(instagramFunnelLeads.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    rule_keyword: r.ruleKeyword,
    post_permalink: r.postPermalink,
    ig_username: r.igUsername,
    ig_user_id: r.igUserId,
    comment_text: r.commentText,
    status: r.status as "sent" | "failed",
    error_message: r.errorMessage,
    created_at: r.createdAt,
  }));
});

export async function fetchFunnelLeads(): Promise<FunnelLeadRow[]> {
  return _fetchFunnelLeads();
}

// ── Funis visuais (editor de blocos) ───────────────────────────────────────

export interface FunnelRow {
  id: string;
  name: string;
  created_at: string;
}

const _fetchFunnels = createServerFn({ method: "GET" }).handler(async (): Promise<FunnelRow[]> => {
  const { organizationId } = await requireOrgContext();
  const rows = await db
    .select()
    .from(instagramFunnels)
    .where(eq(instagramFunnels.organizationId, organizationId))
    .orderBy(desc(instagramFunnels.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name, created_at: r.createdAt }));
});

export async function fetchFunnels(): Promise<FunnelRow[]> {
  return _fetchFunnels();
}

const _createFunnel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { organizationId } = await requireOrgContext();
    return db.transaction(async (tx) => {
      const [funnel] = await tx.insert(instagramFunnels).values({ organizationId, name: data.name.trim() }).returning({ id: instagramFunnels.id });
      // Bloco Gatilho — ponto de entrada fixo, um por funil, criado junto.
      await tx.insert(instagramFunnelNodes).values({ funnelId: funnel.id, type: "trigger", positionX: 80, positionY: 160 });
      return { id: funnel.id };
    });
  });

export async function createFunnel(name: string): Promise<{ id: string }> {
  return _createFunnel({ data: { name } });
}

const _renameFunnel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db
      .update(instagramFunnels)
      .set({ name: data.name.trim() })
      .where(and(eq(instagramFunnels.id, data.id), eq(instagramFunnels.organizationId, organizationId)));
  });

export async function renameFunnel(id: string, name: string): Promise<void> {
  await _renameFunnel({ data: { id, name } });
}

const _deleteFunnel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db.delete(instagramFunnels).where(and(eq(instagramFunnels.id, data.id), eq(instagramFunnels.organizationId, organizationId)));
  });

export async function deleteFunnel(id: string): Promise<void> {
  await _deleteFunnel({ data: { id } });
}

export interface FunnelNodeRow {
  id: string;
  type: "trigger" | "message" | "condition" | "quick_reply" | "follow_gate";
  position_x: number;
  position_y: number;
  message: string | null;
  file_base64: string | null;
  file_mimetype: string | null;
  file_filename: string | null;
  condition_keywords: { id: string; keyword: string }[];
  condition_use_ai: boolean;
  quick_reply_options: { id: string; label: string }[];
  // Só type='follow_gate' — texto da 1ª vez reaproveita `message` acima.
  follow_gate_retry_message: string | null;
  follow_gate_confirm_label: string | null;
  follow_gate_profile_label: string | null;
}

export interface FunnelEdgeRow {
  id: string;
  source_node_id: string;
  source_handle: string | null;
  target_node_id: string;
}

const _fetchFunnelGraph = createServerFn({ method: "GET" })
  .inputValidator(z.object({ funnel_id: z.string() }))
  .handler(async ({ data }): Promise<{ nodes: FunnelNodeRow[]; edges: FunnelEdgeRow[] }> => {
    const { organizationId } = await requireOrgContext();
    const funnel = await db.query.instagramFunnels.findFirst({
      where: and(eq(instagramFunnels.id, data.funnel_id), eq(instagramFunnels.organizationId, organizationId)),
    });
    if (!funnel) throw new Error("Funil não encontrado.");
    const [nodeRows, edgeRows] = await Promise.all([
      db.select().from(instagramFunnelNodes).where(eq(instagramFunnelNodes.funnelId, data.funnel_id)),
      db.select().from(instagramFunnelEdges).where(eq(instagramFunnelEdges.funnelId, data.funnel_id)),
    ]);
    return {
      nodes: nodeRows.map((n) => ({
        id: n.id,
        type: n.type as "trigger" | "message" | "condition" | "quick_reply" | "follow_gate",
        position_x: n.positionX,
        position_y: n.positionY,
        message: n.message,
        file_base64: n.fileBase64,
        file_mimetype: n.fileMimetype,
        file_filename: n.fileFilename,
        condition_keywords: (n.conditionKeywords as { id: string; keyword: string }[] | null) ?? [],
        condition_use_ai: n.conditionUseAi,
        quick_reply_options: (n.quickReplyOptions as { id: string; label: string }[] | null) ?? [],
        follow_gate_retry_message: (n.followGateConfig as { retry?: string } | null)?.retry ?? null,
        follow_gate_confirm_label: (n.followGateConfig as { confirmLabel?: string } | null)?.confirmLabel ?? null,
        follow_gate_profile_label: (n.followGateConfig as { profileLabel?: string } | null)?.profileLabel ?? null,
      })),
      edges: edgeRows.map((e) => ({ id: e.id, source_node_id: e.sourceNodeId, source_handle: e.sourceHandle, target_node_id: e.targetNodeId })),
    };
  });

export async function fetchFunnelGraph(funnelId: string): Promise<{ nodes: FunnelNodeRow[]; edges: FunnelEdgeRow[] }> {
  return _fetchFunnelGraph({ data: { funnel_id: funnelId } });
}

const saveGraphSchema = z.object({
  funnel_id: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["trigger", "message", "condition", "quick_reply", "follow_gate"]),
      position_x: z.number(),
      position_y: z.number(),
      message: z.string().nullable().optional(),
      file_base64: z.string().nullable().optional(),
      file_mimetype: z.string().nullable().optional(),
      file_filename: z.string().nullable().optional(),
      condition_keywords: z.array(z.object({ id: z.string(), keyword: z.string() })).optional(),
      condition_use_ai: z.boolean().optional(),
      // Limites da API de quick_replies da Meta: até 13 botões, rótulo até
      // 20 caracteres — mesmo validado no editor, reforçado aqui.
      quick_reply_options: z.array(z.object({ id: z.string(), label: z.string().max(20) })).max(13).optional(),
      follow_gate_retry_message: z.string().nullable().optional(),
      follow_gate_confirm_label: z.string().max(20).nullable().optional(),
      follow_gate_profile_label: z.string().max(20).nullable().optional(),
    })
  ),
  edges: z.array(
    z.object({
      source_node_id: z.string(),
      source_handle: z.string().nullable().optional(),
      target_node_id: z.string(),
    })
  ),
});

// Substitui o grafo inteiro do funil numa transação — mais simples que
// sincronizar nó a nó, e o volume de dados é pequeno (dezenas de blocos, no
// máximo). Sessões (instagram_funnel_sessions) apontando pra nós apagados
// nessa troca são perdidas (cascade) — aceitável: editar o funil enquanto
// alguém está no meio de uma conversa é raro nesse uso interno.
const _saveFunnelGraph = createServerFn({ method: "POST" })
  .inputValidator(saveGraphSchema)
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const funnel = await db.query.instagramFunnels.findFirst({
      where: and(eq(instagramFunnels.id, data.funnel_id), eq(instagramFunnels.organizationId, organizationId)),
    });
    if (!funnel) throw new Error("Funil não encontrado.");

    await db.transaction(async (tx) => {
      await tx.delete(instagramFunnelEdges).where(eq(instagramFunnelEdges.funnelId, data.funnel_id));
      await tx.delete(instagramFunnelNodes).where(eq(instagramFunnelNodes.funnelId, data.funnel_id));
      if (data.nodes.length > 0) {
        await tx.insert(instagramFunnelNodes).values(
          data.nodes.map((n) => ({
            id: n.id,
            funnelId: data.funnel_id,
            type: n.type,
            positionX: Math.round(n.position_x),
            positionY: Math.round(n.position_y),
            message: n.type === "message" || n.type === "quick_reply" || n.type === "follow_gate" ? (n.message ?? null) : null,
            fileBase64: n.type === "message" ? (n.file_base64 ?? null) : null,
            fileMimetype: n.type === "message" ? (n.file_mimetype ?? null) : null,
            fileFilename: n.type === "message" ? (n.file_filename ?? null) : null,
            conditionKeywords: n.type === "condition" ? (n.condition_keywords ?? []) : [],
            conditionUseAi: n.type === "condition" ? (n.condition_use_ai ?? false) : false,
            quickReplyOptions: n.type === "quick_reply" ? (n.quick_reply_options ?? []) : [],
            followGateConfig:
              n.type === "follow_gate"
                ? {
                    retry: n.follow_gate_retry_message || undefined,
                    confirmLabel: n.follow_gate_confirm_label || undefined,
                    profileLabel: n.follow_gate_profile_label || undefined,
                  }
                : {},
          }))
        );
      }
      if (data.edges.length > 0) {
        await tx.insert(instagramFunnelEdges).values(
          data.edges.map((e) => ({
            funnelId: data.funnel_id,
            sourceNodeId: e.source_node_id,
            sourceHandle: e.source_handle ?? null,
            targetNodeId: e.target_node_id,
          }))
        );
      }
    });
  });

export async function saveFunnelGraph(
  funnelId: string,
  nodes: FunnelNodeRow[],
  edges: { source_node_id: string; source_handle: string | null; target_node_id: string }[]
): Promise<void> {
  await _saveFunnelGraph({ data: { funnel_id: funnelId, nodes, edges } });
}

// "Testar funil" — manda pra um contato real (já com conversa aberta na
// Caixa de Entrada) a partir do 1º bloco do funil, sem precisar de um
// comentário/story de verdade.
const _testFunnel = createServerFn({ method: "POST" })
  .inputValidator(z.object({ funnel_id: z.string(), ig_user_id: z.string() }))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { organizationId } = await requireOrgContext();
    const funnel = await db.query.instagramFunnels.findFirst({
      where: and(eq(instagramFunnels.id, data.funnel_id), eq(instagramFunnels.organizationId, organizationId)),
    });
    if (!funnel) throw new Error("Funil não encontrado.");
    return runFunnelTest(organizationId, data.ig_user_id, data.funnel_id);
  });

export async function testFunnel(funnelId: string, igUserId: string): Promise<{ ok: boolean; error?: string }> {
  return _testFunnel({ data: { funnel_id: funnelId, ig_user_id: igUserId } });
}
