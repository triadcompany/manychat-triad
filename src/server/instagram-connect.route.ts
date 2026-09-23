import { defineHandler, redirect, setCookie } from "h3";
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl, generateState, getSessionOrganizationId } from "./instagram-oauth";

// Ponto de entrada do "Conectar Instagram" — precisa ser navegação de
// verdade (link, não RPC) pro redirect pra Meta funcionar.
export default defineHandler(async (event) => {
  const organizationId = await getSessionOrganizationId(event);
  if (!organizationId) return redirect("/login");

  const state = generateState();
  setCookie(event, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // só precisa sobreviver a ida-e-volta até a Meta
  });

  return redirect(buildAuthorizeUrl(state));
});
