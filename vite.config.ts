import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  server: { host: "::", port: 8080 },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    nitro({
      compressPublicAssets: { gzip: true, brotli: true },
      handlers: [
        {
          // Sem `method`: casa GET (handshake de verificação da Meta) e
          // POST (evento de comentário) — o handler distingue por
          // event.req.method internamente.
          route: "/api/webhooks/instagram",
          handler: "./src/server/instagram-webhook.route.ts",
        },
        {
          // Serve anexo (ex: PDF) de um bloco do funil — a Meta busca essa
          // URL pra anexar o arquivo na mensagem do Direct.
          route: "/api/instagram-files/:nodeId",
          method: "GET",
          handler: "./src/server/instagram-files.route.ts",
        },
        {
          // Início do fluxo "Login with Instagram" — redirect, por isso é
          // handler direto e não server function (precisa ser navegação).
          route: "/api/instagram/connect",
          method: "GET",
          handler: "./src/server/instagram-connect.route.ts",
        },
        {
          // Callback OAuth — pra onde a Meta redireciona de volta com o code.
          route: "/api/instagram/callback",
          method: "GET",
          handler: "./src/server/instagram-callback.route.ts",
        },
        {
          // Renovação do token de longa duração — chamado por cron externo
          // (n8n), autenticado por x-automation-secret, não por sessão.
          route: "/api/instagram/refresh-tokens",
          method: "GET",
          handler: "./src/server/instagram-refresh-tokens.route.ts",
        },
      ],
    }),
    viteReact(),
  ],
});
