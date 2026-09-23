import { defineHandler } from "h3";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { refreshLongLivedToken } from "./instagram-oauth";

const REFRESH_WINDOW_DAYS = 10;

// Chamado por um cron externo (n8n, ~1x/dia) — mesmo padrão de
// automations-tick.route.ts no Gestor de Tráfego: autentica pelo header
// x-automation-secret, sem sessão de usuário, roda cross-org.
export default defineHandler(async (event) => {
  const expected = process.env.AUTOMATION_SECRET;
  const got = event.req.headers.get("x-automation-secret");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const threshold = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const connections = await db.query.instagramConnections.findMany({
    where: and(eq(instagramConnections.active, true), lt(instagramConnections.expiresAt, threshold)),
  });

  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      const { accessToken, expiresInSeconds } = await refreshLongLivedToken(connection.accessToken);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      await db.update(instagramConnections).set({ accessToken, expiresAt }).where(eq(instagramConnections.id, connection.id));
    })
  );

  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") {
      failed += 1;
      console.error("[instagram-refresh-tokens] falha ao renovar:", result.reason);
    }
  }

  return new Response(JSON.stringify({ checked: connections.length, refreshed: connections.length - failed, failed }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
