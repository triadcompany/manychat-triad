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
      ],
    }),
    viteReact(),
  ],
});
