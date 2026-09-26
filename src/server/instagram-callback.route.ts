import { defineHandler, deleteCookie, getCookie, redirect } from "h3";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getSessionOrganizationId,
} from "./instagram-oauth";

// A conexão do Instagram vive na aba "Conexão Instagram" dentro de
// Configurações (ver docs/2026-09-25-navegacao-lateral-manychat-design.md).
const BACK_TO_CONEXAO = "/admin/configuracoes";

export default defineHandler(async (event) => {
  const url = new URL(event.req.url);

  // Usuário cancelou/negou a autorização do lado da Meta.
  if (url.searchParams.get("error")) {
    return redirect(`${BACK_TO_CONEXAO}?error=cancelado`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getCookie(event, OAUTH_STATE_COOKIE);
  deleteCookie(event, OAUTH_STATE_COOKIE, { path: "/" });

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect(`${BACK_TO_CONEXAO}?error=state_invalido`);
  }

  const organizationId = await getSessionOrganizationId(event);
  if (!organizationId) return redirect("/login");

  try {
    const { accessToken: shortLivedToken, userId: instagramBusinessAccountId } = await exchangeCodeForShortLivedToken(code);
    const { accessToken, expiresInSeconds } = await exchangeForLongLivedToken(shortLivedToken);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const existing = await db.query.instagramConnections.findFirst({
      where: eq(instagramConnections.organizationId, organizationId),
    });
    if (existing) {
      await db
        .update(instagramConnections)
        .set({ instagramBusinessAccountId, accessToken, expiresAt, active: true })
        .where(eq(instagramConnections.id, existing.id));
    } else {
      await db.insert(instagramConnections).values({ organizationId, instagramBusinessAccountId, accessToken, expiresAt, active: true });
    }
  } catch (err) {
    console.error("[instagram-callback] falha ao conectar:", err);
    return redirect(`${BACK_TO_CONEXAO}?error=falha_conexao`);
  }

  return redirect(`${BACK_TO_CONEXAO}?connected=1`);
});
