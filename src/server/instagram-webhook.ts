import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  appConfig,
  instagramConnections,
  instagramConversations,
  instagramFollowGates,
  instagramFunnelLeads,
  instagramFunnelRules,
  instagramFunnels,
  instagramFunnelNodes,
  instagramFunnelEdges,
  instagramFunnelSessions,
} from "@/db/schema";
import { logMessage } from "./instagram-messages";

// Recebe os webhooks do Instagram (campo `comments`) — não passa por sessão,
// a conta do Instagram (via `entry[].id`) identifica a organização. Ver spec
// docs/superpowers/specs/2026-09-21-funil-instagram-design.md.
//
// A forma do payload é bem documentada pela Meta (ao contrário da Evolution
// API), mas ainda assim extraída com checagens defensivas — webhook nunca
// deve derrubar por causa de um campo faltando.

// Mesmo host de instagram-funnel.ts — contas conectadas via "Instagram
// Login" usam graph.instagram.com, não graph.facebook.com.
const BASE_URL = "https://graph.instagram.com";

interface CommentChangeValue {
  id?: string; // comment id
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    quick_reply?: { payload?: string };
    // Presente quando a mensagem é resposta a um story (diferente de
    // reply_to.mid, que é resposta a uma mensagem normal da conversa).
    reply_to?: { story?: { id?: string; url?: string } };
  };
  // Clique num botão postback (ex: "Já segui" do gate de seguir) — chega
  // num campo separado de `message`, mutuamente exclusivos. Exige o app
  // inscrito no webhook messaging_postbacks (além de messages).
  postback?: { title?: string; mid?: string; payload?: string };
}

interface InstagramWebhookEntry {
  id?: string; // instagram business account id que recebeu o evento
  changes?: Array<{ field?: string; value?: CommentChangeValue }>;
  messaging?: MessagingEvent[]; // mensagem direta nova (formato separado dos "changes")
}

export interface InstagramWebhookBody {
  object?: string;
  entry?: InstagramWebhookEntry[];
}

export interface WebhookResult {
  handled: boolean;
  reason?: string;
  leadsCreated?: number;
}

export async function handleInstagramWebhook(body: InstagramWebhookBody): Promise<WebhookResult> {
  if (body.object !== "instagram") return { handled: false, reason: "object não é instagram" };

  let leadsCreated = 0;
  for (const entry of body.entry ?? []) {
    const igBusinessAccountId = entry.id;
    if (!igBusinessAccountId) continue;

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const value = change.value;
      if (!value?.id || !value.text || !value.from?.id || !value.media?.id) continue;
      const created = await processComment(igBusinessAccountId, {
        commentId: value.id,
        text: value.text,
        fromId: value.from.id,
        fromUsername: value.from.username ?? null,
        mediaId: value.media.id,
      });
      if (created) leadsCreated++;
    }

    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id;
      // Eco da nossa própria mensagem enviada (sender = a própria conta) —
      // ignora, senão o funil reagiria à mensagem que ele mesmo mandou.
      if (!senderId || senderId === igBusinessAccountId) continue;

      if (event.postback?.payload) {
        await processPostback(igBusinessAccountId, senderId, event.postback.payload);
        continue;
      }

      const text = event.message?.text;
      if (!text || event.message?.is_echo) continue;

      const storyId = event.message?.reply_to?.story?.id;

      // Loga toda mensagem recebida na Caixa de Entrada, tenha disparado
      // algo ou não — só comentário fica de fora (esse aqui é sempre DM).
      // Origem aqui é só o tipo (story_reply/direct) — a palavra-chave da
      // regra, se houver, é preenchida depois via processStoryReply (o
      // casamento de regra só acontece lá).
      const loggingConnection = await db.query.instagramConnections.findFirst({
        where: eq(instagramConnections.instagramBusinessAccountId, igBusinessAccountId),
      });
      if (loggingConnection?.active) {
        // A API de mensagens não devolve username junto do evento — só
        // descobre com uma chamada à parte. Só busca se ainda não sabe (evita
        // bater na API a cada mensagem de uma conversa já identificada).
        const existingConversation = await db.query.instagramConversations.findFirst({
          where: and(
            eq(instagramConversations.organizationId, loggingConnection.organizationId),
            eq(instagramConversations.igUserId, senderId)
          ),
        });
        const username =
          existingConversation?.igUsername ?? (await fetchInstagramUsername(loggingConnection.accessToken, senderId));
        await logMessage(loggingConnection.organizationId, senderId, "in", text, username, {
          type: storyId ? "story_reply" : "direct",
        });
      }

      if (storyId) {
        // Resposta a story é sempre gatilho novo, nunca continuação de
        // sessão pausada — mesma separação que já existe entre comentário e
        // DM comum.
        const created = await processStoryReply(igBusinessAccountId, {
          mid: event.message?.mid ?? storyId,
          text,
          fromId: senderId,
        });
        if (created) leadsCreated++;
        continue;
      }

      await processIncomingMessage(igBusinessAccountId, senderId, text, event.message?.quick_reply?.payload ?? null);
    }
  }

  return { handled: true, leadsCreated };
}

async function processComment(
  igBusinessAccountId: string,
  comment: { commentId: string; text: string; fromId: string; fromUsername: string | null; mediaId: string }
): Promise<boolean> {
  const connection = await db.query.instagramConnections.findFirst({
    where: eq(instagramConnections.instagramBusinessAccountId, igBusinessAccountId),
  });
  if (!connection?.active) return false;

  const rules = await db.query.instagramFunnelRules.findMany({
    where: eq(instagramFunnelRules.postId, comment.mediaId),
  });
  const textLower = comment.text.toLowerCase();
  const rule = rules.find((r) => r.active && textLower.includes(r.keyword.toLowerCase()));
  if (!rule) return false;

  if (rule.requireFollow && !(await fetchIsUserFollowing(connection.accessToken, comment.fromId))) {
    return await startFollowGate(connection, igBusinessAccountId, {
      ruleId: rule.id,
      commentId: comment.commentId,
      igUserId: comment.fromId,
      igUsername: comment.fromUsername,
      commentText: comment.text,
    });
  }

  // A resposta privada a comentário só permite UM bloco de conteúdo antes da
  // pessoa responder (texto OU botões — nunca uma mensagem de texto seguida
  // de outra). Se o funil já começa com um bloco Botões logo depois do
  // Gatilho, funde os botões na própria resposta privada em vez de tentar
  // mandar como uma 2ª mensagem depois (a Meta rejeita isso com "enviada
  // fora do período permitido" — só abre janela de 24h quando a pessoa
  // interage com um botão/quick reply, nunca antes disso).
  let firstQuickReplyNode: { id: string; quickReplyOptions: unknown } | null = null;
  if (rule.funnelId) {
    const trigger = await db.query.instagramFunnelNodes.findFirst({
      where: and(eq(instagramFunnelNodes.funnelId, rule.funnelId), eq(instagramFunnelNodes.type, "trigger")),
    });
    if (trigger) {
      const firstEdge = await db.query.instagramFunnelEdges.findFirst({ where: eq(instagramFunnelEdges.sourceNodeId, trigger.id) });
      if (firstEdge) {
        const targetNode = await db.query.instagramFunnelNodes.findFirst({ where: eq(instagramFunnelNodes.id, firstEdge.targetNodeId) });
        if (targetNode?.type === "quick_reply") firstQuickReplyNode = targetNode;
      }
    }
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    if (firstQuickReplyNode) {
      const options = (firstQuickReplyNode.quickReplyOptions as { id: string; label: string }[] | null) ?? [];
      await sendPrivateReplyWithQuickReplies(connection.accessToken, igBusinessAccountId, comment.commentId, rule.message, options);
    } else {
      await sendPrivateReply(connection.accessToken, igBusinessAccountId, comment.commentId, rule.message);
    }
    await logMessage(connection.organizationId, comment.fromId, "out", rule.message, comment.fromUsername, {
      type: "comment",
      detail: rule.keyword,
    });
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Resposta pública embaixo do comentário — opcional, best-effort: exige a
  // permissão instagram_business_manage_comments (o DM sozinho não precisa),
  // então uma falha aqui não deve derrubar o registro do lead nem sobrescrever
  // o status/erro do DM, que é a parte principal do funil.
  if (rule.publicReply) {
    try {
      await replyToCommentPublicly(connection.accessToken, comment.commentId, rule.publicReply);
    } catch (err) {
      console.error("[instagram-webhook] falha ao responder comentário publicamente:", err);
    }
  }

  const [inserted] = await db
    .insert(instagramFunnelLeads)
    .values({
      ruleId: rule.id,
      commentId: comment.commentId,
      igUsername: comment.fromUsername,
      igUserId: comment.fromId,
      commentText: comment.text.slice(0, 500),
      status,
      errorMessage,
    })
    .onConflictDoNothing({ target: [instagramFunnelLeads.ruleId, instagramFunnelLeads.commentId] })
    .returning({ id: instagramFunnelLeads.id });

  // Sem inserted = webhook reentregue pro mesmo comentário (já processado
  // antes) — não entra no funil de novo, senão duplicaria as mensagens.
  if (inserted) {
    if (firstQuickReplyNode) {
      // Os botões já saíram junto da resposta privada acima — só grava a
      // sessão esperando o clique (mesmo padrão de advanceFunnel), sem
      // reenviar a mensagem do bloco Botões nem seu texto (que fica sem uso
      // nesse caso — só a mensagem da regra + os botões são mandados).
      await db
        .insert(instagramFunnelSessions)
        .values({
          organizationId: connection.organizationId,
          igUserId: comment.fromId,
          funnelId: rule.funnelId!,
          currentNodeId: firstQuickReplyNode.id,
          leadId: inserted.id,
        })
        .onConflictDoUpdate({
          target: [instagramFunnelSessions.organizationId, instagramFunnelSessions.igUserId],
          set: { funnelId: rule.funnelId!, currentNodeId: firstQuickReplyNode.id, leadId: inserted.id, updatedAt: new Date().toISOString() },
        });
    } else {
      await enterFunnelIfConfigured(rule, connection, igBusinessAccountId, comment.fromId, inserted.id);
    }
  }

  return !!inserted;
}

// Espelha processComment, mas pra resposta de story: sem post fixo (story
// expira em 24h) — casa por palavra-chave contra qualquer regra
// trigger_type='story_reply' da organização.
async function processStoryReply(
  igBusinessAccountId: string,
  reply: { mid: string; text: string; fromId: string }
): Promise<boolean> {
  const connection = await db.query.instagramConnections.findFirst({
    where: eq(instagramConnections.instagramBusinessAccountId, igBusinessAccountId),
  });
  if (!connection?.active) return false;

  const rules = await db.query.instagramFunnelRules.findMany({
    where: and(eq(instagramFunnelRules.organizationId, connection.organizationId), eq(instagramFunnelRules.triggerType, "story_reply")),
  });
  const textLower = reply.text.toLowerCase();
  const rule = rules.find((r) => r.active && textLower.includes(r.keyword.toLowerCase()));
  if (!rule) return false;

  if (rule.requireFollow && !(await fetchIsUserFollowing(connection.accessToken, reply.fromId))) {
    return await startFollowGate(connection, igBusinessAccountId, {
      ruleId: rule.id,
      commentId: reply.mid,
      igUserId: reply.fromId,
      igUsername: null,
      commentText: reply.text,
    });
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendDirectMessage(connection.accessToken, igBusinessAccountId, reply.fromId, rule.message);
    await logMessage(connection.organizationId, reply.fromId, "out", rule.message, null, {
      type: "story_reply",
      detail: rule.keyword,
    });
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  // Reaproveita comment_id pra guardar o mid da mensagem — mesma proteção de
  // dedup contra a Meta reentregar o mesmo evento.
  const [inserted] = await db
    .insert(instagramFunnelLeads)
    .values({
      ruleId: rule.id,
      commentId: reply.mid,
      igUsername: null,
      igUserId: reply.fromId,
      commentText: reply.text.slice(0, 500),
      status,
      errorMessage,
    })
    .onConflictDoNothing({ target: [instagramFunnelLeads.ruleId, instagramFunnelLeads.commentId] })
    .returning({ id: instagramFunnelLeads.id });

  if (inserted) {
    await enterFunnelIfConfigured(rule, connection, igBusinessAccountId, reply.fromId, inserted.id);
  }

  return !!inserted;
}

// Compartilhado por processComment, processStoryReply e resolveFollowGate —
// entra no funil visual da regra (se tiver um) a partir do nó de gatilho.
async function enterFunnelIfConfigured(
  rule: { funnelId: string | null },
  connection: { accessToken: string; organizationId: string },
  igBusinessAccountId: string,
  igUserId: string,
  leadId: string
): Promise<void> {
  if (!rule.funnelId) return;
  const trigger = await db.query.instagramFunnelNodes.findFirst({
    where: and(eq(instagramFunnelNodes.funnelId, rule.funnelId), eq(instagramFunnelNodes.type, "trigger")),
  });
  if (!trigger) return;
  const edge = await db.query.instagramFunnelEdges.findFirst({ where: eq(instagramFunnelEdges.sourceNodeId, trigger.id) });
  if (!edge) return;
  await advanceFunnel(connection.accessToken, igBusinessAccountId, igUserId, rule.funnelId, leadId, edge.targetNodeId);
}

// Fase 9 — gate "seguir antes de responder". Payload fixo do botão "Já
// segui" (postback, chega via webhook messaging_postbacks).
const GATE_CONFIRM_PAYLOAD = "gate:confirm_follow";
const GATE_TEXT_FIRST =
  'Falta só um passo: me segue aqui no perfil 👀\n\nAssim que seguir, clica em "Já segui" que eu libero sua mensagem na hora 👇';
const GATE_TEXT_RETRY = "Ainda não te encontrei seguindo 👀 segue rapidinho que eu libero na hora!";

// Registra o lead como "aguardando seguir" (mesma proteção de dedupe por
// ruleId+commentId de sempre — reentrega do mesmo webhook não reenvia o
// aviso), grava o gate pendente e manda o aviso. Retorna se criou lead novo
// (mesmo contrato de processComment/processStoryReply pro contador de leads).
async function startFollowGate(
  connection: { accessToken: string; organizationId: string },
  igBusinessAccountId: string,
  params: { ruleId: string; commentId: string; igUserId: string; igUsername: string | null; commentText: string }
): Promise<boolean> {
  const [inserted] = await db
    .insert(instagramFunnelLeads)
    .values({
      ruleId: params.ruleId,
      commentId: params.commentId,
      igUsername: params.igUsername,
      igUserId: params.igUserId,
      commentText: params.commentText.slice(0, 500),
      status: "pending_follow",
      errorMessage: null,
    })
    .onConflictDoNothing({ target: [instagramFunnelLeads.ruleId, instagramFunnelLeads.commentId] })
    .returning({ id: instagramFunnelLeads.id });
  if (!inserted) return false;

  await db
    .insert(instagramFollowGates)
    .values({ organizationId: connection.organizationId, igUserId: params.igUserId, leadId: inserted.id })
    .onConflictDoUpdate({
      target: [instagramFollowGates.organizationId, instagramFollowGates.igUserId],
      set: { leadId: inserted.id },
    });

  try {
    await sendFollowGateMessage(connection.accessToken, igBusinessAccountId, params.igUserId, "first");
  } catch (err) {
    console.error("[instagram-webhook] falha ao enviar aviso de seguir:", err);
  }

  return true;
}

async function processPostback(igBusinessAccountId: string, senderId: string, payload: string): Promise<void> {
  if (payload === GATE_CONFIRM_PAYLOAD) {
    await resolveFollowGate(igBusinessAccountId, senderId);
  }
}

// Confere se a pessoa segue de verdade; se não, reenvia o aviso (variante de
// repetição) e devolve false — chamador decide o que fazer (nada, sem
// limite de tentativas). Compartilhado pelos dois lugares onde alguém pode
// estar esperando "Já segui": gate de entrada e bloco Seguir no funil.
async function checkFollowOrRetry(connection: { accessToken: string }, igBusinessAccountId: string, igUserId: string): Promise<boolean> {
  const following = await fetchIsUserFollowing(connection.accessToken, igUserId);
  if (!following) {
    try {
      await sendFollowGateMessage(connection.accessToken, igBusinessAccountId, igUserId, "retry");
    } catch (err) {
      console.error("[instagram-webhook] falha ao reenviar aviso de seguir:", err);
    }
  }
  return following;
}

// Clique em "Já segui" — pode estar resolvendo o gate de entrada (regra com
// requireFollow, antes de qualquer funil) ou um bloco Seguir parado no meio
// de um funil. Confere os dois, nessa ordem.
async function resolveFollowGate(igBusinessAccountId: string, igUserId: string): Promise<void> {
  const connection = await db.query.instagramConnections.findFirst({
    where: eq(instagramConnections.instagramBusinessAccountId, igBusinessAccountId),
  });
  if (!connection?.active) return;

  const entryGate = await db.query.instagramFollowGates.findFirst({
    where: and(eq(instagramFollowGates.organizationId, connection.organizationId), eq(instagramFollowGates.igUserId, igUserId)),
  });
  if (entryGate) {
    await resolveEntryFollowGate(connection, igBusinessAccountId, igUserId, entryGate);
    return;
  }

  const session = await db.query.instagramFunnelSessions.findFirst({
    where: and(eq(instagramFunnelSessions.organizationId, connection.organizationId), eq(instagramFunnelSessions.igUserId, igUserId)),
  });
  if (!session) return; // clique órfão — nada pendente
  const node = await db.query.instagramFunnelNodes.findFirst({ where: eq(instagramFunnelNodes.id, session.currentNodeId) });
  if (node?.type !== "follow_gate") return; // sessão pendente é de outro bloco (Condição/Botões) — ignora

  if (!(await checkFollowOrRetry(connection, igBusinessAccountId, igUserId))) return;

  await db.delete(instagramFunnelSessions).where(eq(instagramFunnelSessions.id, session.id));
  const edge = await db.query.instagramFunnelEdges.findFirst({ where: eq(instagramFunnelEdges.sourceNodeId, session.currentNodeId) });
  if (edge) {
    await advanceFunnel(connection.accessToken, igBusinessAccountId, igUserId, session.funnelId, session.leadId, edge.targetNodeId);
  }
}

// Gate de entrada resolvido: apaga o gate, manda a mensagem original da
// regra (agora por DM comum, não mais resposta privada ao comentário — já
// existe uma conversa aberta desde o aviso) e entra no funil se a regra
// tiver um.
async function resolveEntryFollowGate(
  connection: { accessToken: string; organizationId: string },
  igBusinessAccountId: string,
  igUserId: string,
  gate: { id: string; leadId: string }
): Promise<void> {
  if (!(await checkFollowOrRetry(connection, igBusinessAccountId, igUserId))) return;

  await db.delete(instagramFollowGates).where(eq(instagramFollowGates.id, gate.id));

  const lead = await db.query.instagramFunnelLeads.findFirst({ where: eq(instagramFunnelLeads.id, gate.leadId) });
  if (!lead) return;
  const rule = await db.query.instagramFunnelRules.findFirst({ where: eq(instagramFunnelRules.id, lead.ruleId) });
  if (!rule) return;

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendDirectMessage(connection.accessToken, igBusinessAccountId, igUserId, rule.message);
    await logMessage(connection.organizationId, igUserId, "out", rule.message, lead.igUsername, {
      type: rule.triggerType === "story_reply" ? "story_reply" : "comment",
      detail: rule.keyword,
    });
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (rule.triggerType === "comment" && rule.publicReply) {
    try {
      await replyToCommentPublicly(connection.accessToken, lead.commentId, rule.publicReply);
    } catch (err) {
      console.error("[instagram-webhook] falha ao responder comentário publicamente:", err);
    }
  }

  await db.update(instagramFunnelLeads).set({ status, errorMessage }).where(eq(instagramFunnelLeads.id, lead.id));

  await enterFunnelIfConfigured(rule, connection, igBusinessAccountId, igUserId, lead.id);
}

async function processIncomingMessage(
  igBusinessAccountId: string,
  senderId: string,
  text: string,
  quickReplyPayload: string | null
): Promise<void> {
  const connection = await db.query.instagramConnections.findFirst({
    where: eq(instagramConnections.instagramBusinessAccountId, igBusinessAccountId),
  });
  if (!connection?.active) return;

  const session = await db.query.instagramFunnelSessions.findFirst({
    where: and(eq(instagramFunnelSessions.organizationId, connection.organizationId), eq(instagramFunnelSessions.igUserId, senderId)),
  });
  if (!session) return; // mensagem fora de qualquer funil — nada a fazer

  const node = await db.query.instagramFunnelNodes.findFirst({ where: eq(instagramFunnelNodes.id, session.currentNodeId) });
  // Sessão parada num bloco Seguir só resolve pelo clique no botão (postback,
  // ver resolveFollowGate) — texto solto não conta como "já segui".
  if (node?.type === "follow_gate") return;
  // Sempre apaga a sessão antes de seguir — se não achar nó/aresta, o funil
  // só termina aqui, não fica uma sessão órfã esperando pra sempre.
  await db.delete(instagramFunnelSessions).where(eq(instagramFunnelSessions.id, session.id));
  if (!node || (node.type !== "condition" && node.type !== "quick_reply")) return;

  let handle: string;
  if (node.type === "condition") {
    const keywords = (node.conditionKeywords as { id: string; keyword: string }[] | null) ?? [];
    handle = node.conditionUseAi
      ? await classifyReplyWithAI(connection.organizationId, text, keywords)
      : matchByKeyword(text, keywords);
  } else {
    // Bloco Botões: só reage a clique de verdade (payload exato). Texto
    // digitado em vez de tocar num botão cai direto em "default" — este
    // bloco não interpreta texto livre, isso é papel do Condição.
    const options = (node.quickReplyOptions as { id: string; label: string }[] | null) ?? [];
    handle = quickReplyPayload && options.some((o) => o.id === quickReplyPayload) ? quickReplyPayload : "default";
  }

  const edge = await db.query.instagramFunnelEdges.findFirst({
    where: and(eq(instagramFunnelEdges.sourceNodeId, node.id), eq(instagramFunnelEdges.sourceHandle, handle)),
  });
  if (!edge) return; // saída não conectada a nada — funil acaba aqui pra essa pessoa

  await advanceFunnel(connection.accessToken, igBusinessAccountId, senderId, session.funnelId, session.leadId, edge.targetNodeId);
}

function matchByKeyword(text: string, keywords: { id: string; keyword: string }[]): string {
  const textLower = text.toLowerCase();
  const matched = keywords.find((k) => textLower.includes(k.keyword.toLowerCase()));
  return matched?.id ?? "default";
}

// Classifica a resposta usando a chave OpenAI já configurada em
// Configurações → API Key do Agente — entende variações de texto que
// "contém a palavra" não pegaria (ex: "com certeza!" bater com a opção
// "sim"). Cai pro casamento literal se a chave não estiver configurada ou a
// chamada falhar — nunca trava o funil por causa disso.
async function classifyReplyWithAI(organizationId: string, text: string, keywords: { id: string; keyword: string }[]): Promise<string> {
  if (keywords.length === 0) return "default";
  try {
    const row = await db.query.appConfig.findFirst({
      where: and(eq(appConfig.organizationId, organizationId), eq(appConfig.key, "openai_api_key")),
    });
    if (!row?.value) return matchByKeyword(text, keywords);

    const openai = new OpenAI({ apiKey: row.value });
    const optionsList = keywords.map((k, i) => `${i + 1}. ${k.keyword}`).join("\n");
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 5,
      messages: [
        {
          role: "system",
          content: `Você classifica a resposta de um lead num funil de vendas do Instagram. Escolha qual das opções abaixo melhor representa a intenção da mensagem da pessoa, mesmo que as palavras usadas sejam diferentes. Responda só com o número da opção. Se nenhuma se encaixar, responda "0".\n\nOpções:\n${optionsList}`,
        },
        { role: "user", content: text },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim() ?? "0";
    const idx = parseInt(answer, 10);
    if (Number.isInteger(idx) && idx >= 1 && idx <= keywords.length) return keywords[idx - 1].id;
    return "default";
  } catch (err) {
    console.error("[instagram-webhook] falha ao classificar resposta com IA, usando casamento literal:", err);
    return matchByKeyword(text, keywords);
  }
}

// Segue o grafo a partir de um nó: manda mensagens em sequência sem pausa
// até bater numa Condição ou num bloco Botões, onde grava a sessão e para
// pra esperar a próxima resposta da pessoa.
async function advanceFunnel(
  accessToken: string,
  igBusinessAccountId: string,
  igUserId: string,
  funnelId: string,
  leadId: string,
  nodeId: string
): Promise<void> {
  const node = await db.query.instagramFunnelNodes.findFirst({ where: eq(instagramFunnelNodes.id, nodeId) });
  if (!node) return;
  // Buscado uma vez só e reaproveitado nos 3 branches — só precisa do
  // organizationId (pra sessão e pro log da Caixa de Entrada).
  const funnel = await db.query.instagramFunnels.findFirst({ where: eq(instagramFunnels.id, funnelId) });
  if (!funnel) return;

  if (node.type === "message") {
    try {
      if (node.fileBase64) {
        // Anexo (ex: PDF) — a Meta busca o arquivo por URL pública própria,
        // não aceita base64 direto na mensagem.
        const appUrl = process.env.APP_URL;
        if (!appUrl) throw new Error("APP_URL não configurada — necessária pra anexo de arquivo.");
        await sendFileMessage(accessToken, igBusinessAccountId, igUserId, `${appUrl.replace(/\/+$/, "")}/api/instagram-files/${node.id}`);
        await logMessage(funnel.organizationId, igUserId, "out", `[arquivo: ${node.fileFilename ?? "anexo"}]`);
      } else if (node.message) {
        await sendDirectMessage(accessToken, igBusinessAccountId, igUserId, node.message);
        await logMessage(funnel.organizationId, igUserId, "out", node.message);
      }
    } catch (err) {
      console.error("[instagram-webhook] falha ao enviar mensagem do funil:", err);
      return; // não segue adiante se a mensagem não saiu
    }
    const edge = await db.query.instagramFunnelEdges.findFirst({ where: eq(instagramFunnelEdges.sourceNodeId, node.id) });
    if (edge) await advanceFunnel(accessToken, igBusinessAccountId, igUserId, funnelId, leadId, edge.targetNodeId);
    return;
  }

  if (node.type === "condition") {
    await db
      .insert(instagramFunnelSessions)
      .values({ organizationId: funnel.organizationId, igUserId, funnelId, currentNodeId: node.id, leadId })
      .onConflictDoUpdate({
        target: [instagramFunnelSessions.organizationId, instagramFunnelSessions.igUserId],
        set: { funnelId, currentNodeId: node.id, leadId, updatedAt: new Date().toISOString() },
      });
    return;
  }

  if (node.type === "follow_gate") {
    if (await fetchIsUserFollowing(accessToken, igUserId)) {
      const edge = await db.query.instagramFunnelEdges.findFirst({ where: eq(instagramFunnelEdges.sourceNodeId, node.id) });
      if (edge) await advanceFunnel(accessToken, igBusinessAccountId, igUserId, funnelId, leadId, edge.targetNodeId);
      return;
    }
    try {
      await sendFollowGateMessage(accessToken, igBusinessAccountId, igUserId, "first");
    } catch (err) {
      console.error("[instagram-webhook] falha ao enviar aviso de seguir do funil:", err);
      return;
    }
    await db
      .insert(instagramFunnelSessions)
      .values({ organizationId: funnel.organizationId, igUserId, funnelId, currentNodeId: node.id, leadId })
      .onConflictDoUpdate({
        target: [instagramFunnelSessions.organizationId, instagramFunnelSessions.igUserId],
        set: { funnelId, currentNodeId: node.id, leadId, updatedAt: new Date().toISOString() },
      });
    return;
  }

  if (node.type === "quick_reply") {
    if (!node.message) return; // sem mensagem não tem o que mandar — bloco mal configurado
    const options = ((node.quickReplyOptions as { id: string; label: string }[] | null) ?? []).slice(0, 13);
    try {
      await sendDirectMessageWithQuickReplies(accessToken, igBusinessAccountId, igUserId, node.message, options);
      await logMessage(funnel.organizationId, igUserId, "out", node.message);
    } catch (err) {
      console.error("[instagram-webhook] falha ao enviar botões do funil:", err);
      return; // sem a mensagem sair, não faz sentido ficar esperando clique
    }
    await db
      .insert(instagramFunnelSessions)
      .values({ organizationId: funnel.organizationId, igUserId, funnelId, currentNodeId: node.id, leadId })
      .onConflictDoUpdate({
        target: [instagramFunnelSessions.organizationId, instagramFunnelSessions.igUserId],
        set: { funnelId, currentNodeId: node.id, leadId, updatedAt: new Date().toISOString() },
      });
  }
}

async function sendPrivateReply(accessToken: string, igBusinessAccountId: string, commentId: string, text: string): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Resposta privada a comentário com botões — a documentação oficial da Meta
// só mostra o payload com texto puro, mas na prática aceita quick_replies
// no mesmo formato de uma mensagem normal (é assim que ferramentas como o
// ManyChat conseguem botão já na 1ª mensagem depois do comentário).
async function sendPrivateReplyWithQuickReplies(
  accessToken: string,
  igBusinessAccountId: string,
  commentId: string,
  text: string,
  options: { id: string; label: string }[]
): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: {
        text,
        quick_replies: options.slice(0, 13).map((o) => ({
          content_type: "text",
          title: o.label.slice(0, 20),
          payload: o.id,
        })),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function sendDirectMessage(accessToken: string, igBusinessAccountId: string, igUserId: string, text: string): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igUserId }, message: { text } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Limites documentados da Meta pra quick_replies: até 13 botões, título até
// 20 caracteres (truncado depois disso). Já validado no editor, mas
// truncado aqui também — defensivo contra dado antigo/salvo por outro caminho.
async function sendDirectMessageWithQuickReplies(
  accessToken: string,
  igBusinessAccountId: string,
  igUserId: string,
  text: string,
  options: { id: string; label: string }[]
): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: {
        text,
        quick_replies: options.slice(0, 13).map((o) => ({
          content_type: "text",
          title: o.label.slice(0, 20),
          payload: o.id,
        })),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

interface TemplateButton {
  type: "web_url" | "postback";
  title: string;
  url?: string;
  payload?: string;
}

// Limites documentados da Meta pro button template: até 3 botões, texto até
// 640 caracteres.
async function sendButtonTemplate(
  accessToken: string,
  igBusinessAccountId: string,
  igUserId: string,
  text: string,
  buttons: TemplateButton[]
): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: igUserId },
      message: {
        attachment: {
          type: "template",
          payload: { template_type: "button", text: text.slice(0, 640), buttons: buttons.slice(0, 3) },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Monta e manda o aviso do gate de seguir — "Ver perfil" (só se conseguir
// descobrir o @ da própria conta conectada) + "Já segui" (postback).
async function sendFollowGateMessage(
  accessToken: string,
  igBusinessAccountId: string,
  igUserId: string,
  variant: "first" | "retry"
): Promise<void> {
  const ownUsername = await fetchInstagramUsername(accessToken, igBusinessAccountId);
  const buttons: TemplateButton[] = [];
  if (ownUsername) {
    buttons.push({ type: "web_url", title: "Ver perfil 👀", url: `https://www.instagram.com/${ownUsername}` });
  }
  buttons.push({ type: "postback", title: "Já segui 💙", payload: GATE_CONFIRM_PAYLOAD });

  await sendButtonTemplate(accessToken, igBusinessAccountId, igUserId, variant === "first" ? GATE_TEXT_FIRST : GATE_TEXT_RETRY, buttons);
}

async function sendFileMessage(accessToken: string, igBusinessAccountId: string, igUserId: string, fileUrl: string): Promise<void> {
  const url = `${BASE_URL}/${igBusinessAccountId}/messages?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igUserId }, message: { attachment: { type: "file", payload: { url: fileUrl } } } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}

// Busca o username de quem mandou uma DM — a API de mensagens não devolve
// isso junto do evento, só via chamada à parte. Best-effort: só funciona
// pra quem já interagiu recentemente com a conta (janela de retenção da
// Meta), então uma falha aqui não deve travar o registro da mensagem.
async function fetchInstagramUsername(accessToken: string, igUserId: string): Promise<string | null> {
  try {
    const url = `${BASE_URL}/${igUserId}?fields=username&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    return data.username ?? null;
  } catch {
    return null;
  }
}

// Checa se a pessoa segue a conta conectada — best-effort: qualquer falha
// (rede, permissão, janela de retenção expirada) conta como "não segue"
// (fail-closed: prefere pedir de novo a vazar a mensagem indevidamente).
async function fetchIsUserFollowing(accessToken: string, igUserId: string): Promise<boolean> {
  try {
    const url = `${BASE_URL}/${igUserId}?fields=is_user_follow_business&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = (await res.json()) as { is_user_follow_business?: boolean };
    return data.is_user_follow_business === true;
  } catch {
    return false;
  }
}

async function replyToCommentPublicly(accessToken: string, commentId: string, message: string): Promise<void> {
  const url = `${BASE_URL}/${commentId}/replies?access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
  }
}
