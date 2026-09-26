import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { instagramContactTags, instagramConversations, instagramTags } from "@/db/schema";
import { requireOrgContext } from "@/server/session";

// Paleta fixa — evita input de hex livre no editor, mantém as tags
// visualmente consistentes entre organizações.
export const TAG_COLORS = [
  "#ef4444", // vermelho
  "#f97316", // laranja
  "#eab308", // amarelo
  "#22c55e", // verde
  "#14b8a6", // teal
  "#3b82f6", // azul
  "#8b5cf6", // roxo
  "#ec4899", // rosa
] as const;

const tagColorSchema = z.enum(TAG_COLORS);

export interface TagRow {
  id: string;
  name: string;
  color: string;
}

export interface ContactRow {
  ig_user_id: string;
  ig_username: string | null;
  last_message_at: string;
  last_message_preview: string;
  source_type: "comment" | "story_reply" | "direct" | null;
  source_detail: string | null;
  tags: TagRow[];
}

const _fetchTags = createServerFn({ method: "GET" }).handler(async (): Promise<TagRow[]> => {
  const { organizationId } = await requireOrgContext();
  const rows = await db.query.instagramTags.findMany({
    where: eq(instagramTags.organizationId, organizationId),
    orderBy: instagramTags.name,
  });
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
});

export async function fetchTags(): Promise<TagRow[]> {
  return _fetchTags();
}

const _createTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().trim().min(1).max(40), color: tagColorSchema }))
  .handler(async ({ data }): Promise<TagRow> => {
    const { organizationId } = await requireOrgContext();
    const [inserted] = await db
      .insert(instagramTags)
      .values({ organizationId, name: data.name, color: data.color })
      .onConflictDoNothing({ target: [instagramTags.organizationId, instagramTags.name] })
      .returning({ id: instagramTags.id, name: instagramTags.name, color: instagramTags.color });
    if (!inserted) throw new Error("Já existe uma tag com esse nome.");
    return inserted;
  });

export async function createTag(name: string, color: string): Promise<TagRow> {
  return _createTag({ data: { name, color: color as (typeof TAG_COLORS)[number] } });
}

const _deleteTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ tag_id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireOrgContext();
    await db.delete(instagramTags).where(and(eq(instagramTags.id, data.tag_id), eq(instagramTags.organizationId, organizationId)));
  });

export async function deleteTag(tagId: string): Promise<void> {
  await _deleteTag({ data: { tag_id: tagId } });
}

async function findOwnConversation(organizationId: string, igUserId: string) {
  const conversation = await db.query.instagramConversations.findFirst({
    where: and(eq(instagramConversations.organizationId, organizationId), eq(instagramConversations.igUserId, igUserId)),
  });
  if (!conversation) throw new Error("Contato não encontrado.");
  return conversation;
}

const _assignTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ig_user_id: z.string(), tag_id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireOrgContext();
    const [conversation, tag] = await Promise.all([
      findOwnConversation(organizationId, data.ig_user_id),
      db.query.instagramTags.findFirst({ where: and(eq(instagramTags.id, data.tag_id), eq(instagramTags.organizationId, organizationId)) }),
    ]);
    if (!tag) throw new Error("Tag não encontrada.");
    await db
      .insert(instagramContactTags)
      .values({ conversationId: conversation.id, tagId: tag.id })
      .onConflictDoNothing({ target: [instagramContactTags.conversationId, instagramContactTags.tagId] });
  });

export async function assignTag(igUserId: string, tagId: string): Promise<void> {
  await _assignTag({ data: { ig_user_id: igUserId, tag_id: tagId } });
}

const _removeTag = createServerFn({ method: "POST" })
  .inputValidator(z.object({ ig_user_id: z.string(), tag_id: z.string() }))
  .handler(async ({ data }): Promise<void> => {
    const { organizationId } = await requireOrgContext();
    const conversation = await findOwnConversation(organizationId, data.ig_user_id);
    await db
      .delete(instagramContactTags)
      .where(and(eq(instagramContactTags.conversationId, conversation.id), eq(instagramContactTags.tagId, data.tag_id)));
  });

export async function removeTag(igUserId: string, tagId: string): Promise<void> {
  await _removeTag({ data: { ig_user_id: igUserId, tag_id: tagId } });
}

const _fetchContacts = createServerFn({ method: "GET" })
  .inputValidator(z.object({ tag_id: z.string().optional() }))
  .handler(async ({ data }): Promise<ContactRow[]> => {
    const { organizationId } = await requireOrgContext();

    let onlyConversationIds: string[] | null = null;
    if (data.tag_id) {
      const links = await db.query.instagramContactTags.findMany({ where: eq(instagramContactTags.tagId, data.tag_id) });
      onlyConversationIds = links.map((l) => l.conversationId);
      if (onlyConversationIds.length === 0) return [];
    }

    const conversations = await db.query.instagramConversations.findMany({
      where: onlyConversationIds
        ? and(eq(instagramConversations.organizationId, organizationId), inArray(instagramConversations.id, onlyConversationIds))
        : eq(instagramConversations.organizationId, organizationId),
      orderBy: desc(instagramConversations.lastMessageAt),
    });
    if (conversations.length === 0) return [];

    const tagLinks = await db.query.instagramContactTags.findMany({
      where: inArray(
        instagramContactTags.conversationId,
        conversations.map((c) => c.id)
      ),
      with: { tag: true },
    });
    const tagsByConversationId = new Map<string, TagRow[]>();
    for (const link of tagLinks) {
      const list = tagsByConversationId.get(link.conversationId) ?? [];
      list.push({ id: link.tag.id, name: link.tag.name, color: link.tag.color });
      tagsByConversationId.set(link.conversationId, list);
    }

    return conversations.map((c) => ({
      ig_user_id: c.igUserId,
      ig_username: c.igUsername,
      last_message_at: c.lastMessageAt,
      last_message_preview: c.lastMessagePreview,
      source_type: c.sourceType as ContactRow["source_type"],
      source_detail: c.sourceDetail,
      tags: tagsByConversationId.get(c.id) ?? [],
    }));
  });

export async function fetchContacts(tagId?: string): Promise<ContactRow[]> {
  return _fetchContacts({ data: { tag_id: tagId } });
}
