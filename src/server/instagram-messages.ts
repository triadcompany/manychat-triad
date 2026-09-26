import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { instagramConnections, instagramConversations, instagramMessages, instagramFunnelSessions } from "@/db/schema";
import { requireOrgContext } from "@/server/session";

const BASE_URL = "https://graph.instagram.com";

// Chamado pelo motor do webhook (toda mensagem recebida/enviada, tenha
// disparado automação ou não) e pela própria Caixa de Entrada. Upsert na
// conversa (prévia + horário da última mensagem) + insert no histórico.
// createServerOnlyFn (não é RPC) evita que o uso de `db` aqui vaze pro
// bundle do cliente — este arquivo também é importado por rotas client
// (pelas funções abaixo), mesmo padrão já usado em session.ts.
export const logMessage = createServerOnlyFn(async (
  organizationId: string,
  igUserId: string,
  direction: "in" | "out",
  text: string,
  igUsername?: string | null
): Promise<void> => {
  const preview = text.slice(0, 200);
  const [conversation] = await db
    .insert(instagramConversations)
    .values({ organizationId, igUserId, igUsername: igUsername ?? null, lastMessagePreview: preview })
    .onConflictDoUpdate({
      target: [instagramConversations.organizationId, instagramConversations.igUserId],
      set: {
        lastMessagePreview: preview,
        lastMessageAt: new Date().toISOString(),
        ...(igUsername ? { igUsername } : {}),
      },
    })
    .returning({ id: instagramConversations.id });

  await db.insert(instagramMessages).values({ conversationId: conversation.id, direction, text });
});

export interface ConversationRow {
  ig_user_id: string;
  ig_username: string | null;
  last_message_preview: string;
  last_message_at: string;
}

const _fetchConversations = createServerFn({ method: "GET" }).handler(async (): Promise<ConversationRow[]> => {
  const { organizationId } = await requireOrgContext();
  const rows = await db
    .select()
    .from(instagramConversations)
    .where(eq(instagramConversations.organizationId, organizationId))
    .orderBy(desc(instagramConversations.lastMessageAt));
  return rows.map((r) => ({
    ig_user_id: r.igUserId,
    ig_username: r.igUsername,
    last_message_preview: r.lastMessagePreview,
    last_message_at: r.lastMessageAt,
  }));
});

export async function fetchConversations(): Promise<ConversationRow[]> {
  return _fetchConversations();
}

export interface MessageRow {
  id: string;
  direction: "in" | "out";
  text: string;
  created_at: string;
}

const _fetchConversationMessages = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ig_user_id: z.string() }))
  .handler(async ({ data }): Promise<MessageRow[]> => {
    const { organizationId } = await requireOrgContext();
    const conversation = await db.query.instagramConversations.findFirst({
      where: and(eq(instagramConversations.organizationId, organizationId), eq(instagramConversations.igUserId, data.ig_user_id)),
    });
    if (!conversation) return [];
    const rows = await db
      .select()
      .from(instagramMessages)
      .where(eq(instagramMessages.conversationId, conversation.id))
      .orderBy(instagramMessages.createdAt);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction as "in" | "out",
      text: r.text,
      created_at: r.createdAt,
    }));
  });

export async function fetchConversationMessages(igUserId: string): Promise<MessageRow[]> {
  return _fetchConversationMessages({ data: { ig_user_id: igUserId } });
}

const _sendManualMessage = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ig_user_id: z.string(), text: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    const connection = await db.query.instagramConnections.findFirst({
      where: and(eq(instagramConnections.organizationId, organizationId), eq(instagramConnections.active, true)),
    });
    if (!connection) throw new Error("Conecte o Instagram antes de responder.");

    const url = `${BASE_URL}/${connection.instagramBusinessAccountId}/messages?access_token=${encodeURIComponent(connection.accessToken)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: data.ig_user_id }, message: { text: data.text } }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meta retornou ${res.status}: ${body.slice(0, 300)}`);
    }

    await logMessage(organizationId, data.ig_user_id, "out", data.text);

    // Resposta manual pausa a automação — apaga a sessão de funil em
    // andamento pra esse contato, se houver, senão o bot pode mandar
    // mensagem em cima de quem já está atendendo manualmente.
    await db
      .delete(instagramFunnelSessions)
      .where(and(eq(instagramFunnelSessions.organizationId, organizationId), eq(instagramFunnelSessions.igUserId, data.ig_user_id)));
  });

export async function sendManualMessage(igUserId: string, text: string): Promise<void> {
  await _sendManualMessage({ data: { ig_user_id: igUserId, text } });
}
