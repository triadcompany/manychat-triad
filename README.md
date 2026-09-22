# manychat-triad

Funil de vendas via Instagram (comentário → Direct → fluxo em blocos) — extraído do app interno **gestor-trafego-triad** como ponto de partida pra virar um produto próprio.

Ideia original: dentro do Instagram, quando alguém comenta uma palavra-chave num post, o sistema manda uma mensagem no Direct automaticamente (tipo Manychat) e a conversa pode seguir por um funil visual (blocos de Gatilho → Mensagem → Condição, com ramificação por palavra-chave ou por IA).

## Estado deste repositório

Isto é **só o código-fonte copiado como referência** — não builda nem roda sozinho ainda. Foi tirado do meio de um app maior (multi-tenant, com auth, clientes, Meta Ads etc.) e ainda carrega esse acoplamento. Falta bastante trabalho de scaffolding antes de virar um projeto independente rodável. Ver "O que falta" abaixo.

Hoje o acesso é travado só pra organização da Triad Company (`requirePlatformAdminOrg` em `instagram-funnel.ts`, que checa `isPlatformAdmin` além da sessão). Pra virar SaaS de verdade — qualquer empresa se cadastra e conecta o próprio Instagram — essa trava precisa sair, e o modelo de organização/usuário precisa ser desenhado do zero pra esse produto (decisão consciente de deixar pra depois, feita ao extrair este código).

## Estrutura

```
src/
  server/
    instagram-funnel.ts        # CRUD de conexão, regras, funis, leads (session-gated, platform admin)
    instagram-webhook.ts       # motor de execução — recebe comentário/DM da Meta, roda o funil
    instagram-webhook.route.ts # handler Nitro/h3 do webhook (verificação + validação HMAC)
    instagram-files.route.ts   # serve anexo (ex: PDF) de um bloco de mensagem pra Meta buscar
    session.ts                 # auth da app original (JWT em cookie) — precisa decidir se reaproveita ou reescreve
  lib/
    auth.ts                    # bcrypt + JWT (assinar/verificar sessão) usado por session.ts — genérico, sem acoplamento
  routes/
    admin.instagram-conexao.tsx           # tela de conectar a conta do Instagram
    admin.instagram-funil.tsx             # abas Regras / Funis / Leads
    admin.instagram-funil-editor.$funnelId.tsx  # editor visual (React Flow) dos blocos do funil
  db/
    schema.ts   # schema Drizzle COMPLETO do app original — só uma fração das tabelas é deste
                # recurso (ver lista abaixo); o resto pode ser podado quando isto virar projeto próprio
    client.ts   # cliente Postgres (drizzle-orm/postgres-js), genérico
drizzle/        # migrações SQL das tabelas do funil, na ordem em que foram criadas
docs/           # specs originais de design (fase 1: regras; fase 2: funil visual em blocos)
```

### Tabelas relevantes em `schema.ts`

`instagram_connections`, `instagram_funnel_rules`, `instagram_funnel_leads`, `instagram_funnels`, `instagram_funnel_nodes`, `instagram_funnel_edges`, `instagram_funnel_sessions` — mais `organizations` e `profiles`, que essas referenciam via FK.

## O que falta pra rodar isolado

1. **Projeto TanStack Start do zero** — `package.json`, `vite.config.ts` (TanStack Start + Nitro), `tsconfig.json`, Tailwind, etc. Nenhum desses veio junto.
2. **Handlers do Nitro** (webhook e arquivo do funil não passam pelo roteador normal — são registrados direto no `vite.config.ts`):
   ```ts
   nitro({
     handlers: [
       { route: "/api/webhooks/instagram", handler: "./src/server/instagram-webhook.route.ts" }, // sem `method`: GET (handshake) + POST (evento)
       { route: "/api/instagram-files/:nodeId", method: "GET", handler: "./src/server/instagram-files.route.ts" },
     ],
   })
   ```
3. **Componentes shadcn/ui** usados pelas rotas: `badge`, `button`, `card`, `dialog`, `input`, `label`, `select`, `skeleton`, `switch`, `table`, `tabs`, `textarea` — regenerar via `npx shadcn add ...`, não foram copiados (são boilerplate do shadcn, não código deste recurso).
4. **`@/components/AppShell`** — layout/navegação do app original, não copiado. Precisa de um shell próprio (ou algo mais simples) pro produto novo.
5. **Dependência de npm `@xyflow/react`** — usada no editor visual do funil (`admin.instagram-funil-editor.$funnelId.tsx`).
6. **`openai` (npm)** — usado em `instagram-webhook.ts` pra classificação por IA nos blocos de Condição.
7. **Variáveis de ambiente**: `DATABASE_URL`, `JWT_SECRET`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `APP_URL`. Nenhuma foi trazida (nem os valores, nem um `.env.example`).
8. **`bcryptjs` e `jsonwebtoken` (npm)** — usados por `src/lib/auth.ts`.
9. **Auth/multi-tenant do zero** — `session.ts` veio como referência de como a app original resolve `organizationId`/`isPlatformAdmin` a partir de um cookie JWT, mas esse modelo (uma única org "Triad Company" com trava de admin) não serve pra SaaS multi-cliente. Precisa desenhar signup, isolamento por tenant, e conexão do Instagram por conta própria de cada cliente.
9. **Meta Developers**: cada tenant precisaria de App Review da Meta pra sair do modo "Standard Access" (hoje funciona sem review só porque a conta é adicionada manualmente como Tester no app da Triad — não escala pra SaaS multi-cliente).

## Referência rápida da API do Instagram usada

- Host: `https://graph.instagram.com` (fluxo "Instagram Login", sem Facebook Page — **não** `graph.facebook.com`).
- Permissões: `instagram_business_basic` + `instagram_business_manage_messages` (mensagens); `instagram_business_manage_comments` (resposta pública a comentário).
- Resposta privada a comentário: `POST /{ig-business-id}/messages` com `{recipient: {comment_id}, message: {text}}` — 1 por comentário, até 7 dias depois.
- DM numa conversa já aberta: mesmo endpoint com `{recipient: {id: igUserId}, message: {...}}`.
- Anexo (ex. PDF): `{recipient: {id}, message: {attachment: {type: "file", payload: {url}}}}` — a Meta busca a URL, precisa ser pública, até 25MB.
- Resposta pública a comentário: `POST /{comment-id}/replies` com `{message}`.
- Webhook: `entry[].changes[]` (campo `comments`) pra comentários; `entry[].messaging[]` pra DMs — filtrar `message.is_echo` pra não reprocessar a própria mensagem enviada.
