import { randomBytes } from "node:crypto";
import { getCookie, type H3Event } from "h3";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, users } from "@/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Handlers registrados direto no vite.config.ts (fora do roteador do
// TanStack Start) não têm o contexto de request dele — não dá pra usar
// requireOrgContext()/getCookie de @tanstack/react-start/server aqui.
// Resolve a sessão na mão, lendo o mesmo cookie que session.ts usa.
export async function getSessionOrganizationId(event: H3Event): Promise<string | null> {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const rows = await db
    .select({ organizationId: profiles.organizationId, active: users.active })
    .from(users)
    .innerJoin(profiles, eq(profiles.id, users.id))
    .where(eq(users.id, payload.userId))
    .limit(1);
  const row = rows[0];
  if (!row?.active) return null;
  return row.organizationId;
}

export const OAUTH_STATE_COOKIE = "ig_oauth_state";

const AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const GRAPH_URL = "https://graph.instagram.com";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Faltou a env var ${name}.`);
  return value;
}

export function generateState(): string {
  return randomBytes(24).toString("hex");
}

export function buildRedirectUri(): string {
  return `${requireEnv("APP_URL").replace(/\/$/, "")}/api/instagram/callback`;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    redirect_uri: buildRedirectUri(),
    scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments",
    response_type: "code",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function parseJsonOrThrow<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao ${action} (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function exchangeCodeForShortLivedToken(code: string): Promise<{ accessToken: string }> {
  const body = new URLSearchParams({
    client_id: requireEnv("INSTAGRAM_APP_ID"),
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: buildRedirectUri(),
    code,
  });
  const res = await fetch(TOKEN_URL, { method: "POST", body });
  const json = await parseJsonOrThrow<{ access_token: string }>(res, "trocar code por token");
  return { accessToken: json.access_token };
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: requireEnv("INSTAGRAM_APP_SECRET"),
    access_token: shortLivedToken,
  });
  const res = await fetch(`${GRAPH_URL}/access_token?${params}`);
  const json = await parseJsonOrThrow<{ access_token: string; expires_in: number }>(res, "trocar por token de longa duração");
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export async function fetchInstagramAccountId(accessToken: string): Promise<string> {
  const params = new URLSearchParams({ fields: "id", access_token: accessToken });
  const res = await fetch(`${GRAPH_URL}/me?${params}`);
  const json = await parseJsonOrThrow<{ id: string }>(res, "buscar a conta do Instagram");
  return json.id;
}

export async function refreshLongLivedToken(currentToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
  const params = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: currentToken });
  const res = await fetch(`${GRAPH_URL}/refresh_access_token?${params}`);
  const json = await parseJsonOrThrow<{ access_token: string; expires_in: number }>(res, "renovar o token");
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}
