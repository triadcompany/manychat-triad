import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { requireOrgContext } from "@/server/session";

const OPENAI_KEY_CONFIG_KEY = "openai_api_key";

// Não devolve a chave em texto pra tela — só se está configurada ou não.
// classifyReplyWithAI (instagram-webhook.ts) lê o valor direto do banco.
export const fetchOpenAiKeyStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean }> => {
    const { organizationId } = await requireOrgContext();
    const row = await db.query.appConfig.findFirst({
      where: and(eq(appConfig.organizationId, organizationId), eq(appConfig.key, OPENAI_KEY_CONFIG_KEY)),
    });
    return { configured: !!row?.value };
  }
);

export const setOpenAiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ value: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireOrgContext();
    await db
      .insert(appConfig)
      .values({ organizationId, key: OPENAI_KEY_CONFIG_KEY, value: data.value.trim() })
      .onConflictDoUpdate({
        target: [appConfig.organizationId, appConfig.key],
        set: { value: data.value.trim() },
      });
  });

export const clearOpenAiKey = createServerFn({ method: "POST" }).handler(async () => {
  const { organizationId } = await requireOrgContext();
  await db
    .delete(appConfig)
    .where(and(eq(appConfig.organizationId, organizationId), eq(appConfig.key, OPENAI_KEY_CONFIG_KEY)));
});
