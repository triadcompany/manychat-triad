# manychat-triad

Funil de vendas via Instagram (comentário → Direct → fluxo em blocos) — extraído do app interno **gestor-trafego-triad** como ponto de partida pra virar um produto próprio.

Ideia original: dentro do Instagram, quando alguém comenta uma palavra-chave num post, o sistema manda uma mensagem no Direct automaticamente (tipo Manychat) e a conversa pode seguir por um funil visual (blocos de Gatilho → Mensagem → Condição, com ramificação por palavra-chave ou por IA).

## Estado deste repositório

Projeto TanStack Start + Nitro independente, roda sozinho (`npm run dev` / `npm run build && npm start`) com banco Postgres próprio, separado do app original. Ver `docs/2026-09-22-saas-scaffolding-design.md` pro design dessa fase.

Hoje o acesso ainda é travado só pra organização da Triad Company (`requirePlatformAdminOrg` em `instagram-funnel.ts`, que checa `isPlatformAdmin` além da sessão) e a conexão do Instagram ainda é manual (colar token gerado à mão). Pra virar SaaS de verdade — qualquer empresa se cadastra e conecta o próprio Instagram — essa trava precisa sair e o fluxo de conexão precisa virar OAuth de verdade; isso é trabalho das próximas fases (auth self-service e conexão via OAuth), ainda não feito.

### Rodando local

```
cp .env.example .env   # preencha DATABASE_URL e os demais
npm install
npm run db:migrate     # aplica drizzle/0000_smiling_rage.sql
npm run create-user -- voce@exemplo.com "sua-senha" "Seu Nome"
npm run dev
```

## Estrutura

```
src/
  server/
    instagram-funnel.ts        # CRUD de conexão, regras, funis, leads (session-gated, platform admin)
    instagram-webhook.ts       # motor de execução — recebe comentário/DM da Meta, roda o funil
    instagram-webhook.route.ts # handler Nitro/h3 do webhook (verificação + validação HMAC)
    instagram-files.route.ts   # serve anexo (ex: PDF) de um bloco de mensagem pra Meta buscar
    session.ts                 # auth (JWT em cookie) — mesma lógica do app original, ainda não é self-service
    settings.ts                 # chave da OpenAI por organização (app_config)
  lib/
    auth.ts                    # bcrypt + JWT (assinar/verificar sessão) usado por session.ts
    utils.ts                    # helper cn() do shadcn
  routes/
    __root.tsx                            # shell HTML, providers, guard de sessão
    login.tsx / index.tsx                 # login e redirect pra /admin/instagram-funil
    admin.instagram-conexao.tsx           # tela de conectar a conta do Instagram (ainda manual)
    admin.instagram-funil.tsx             # abas Regras / Funis / Leads
    admin.instagram-funil-editor.$funnelId.tsx  # editor visual (React Flow) dos blocos do funil
    admin.configuracoes.tsx               # chave da OpenAI
  components/
    AppShell.tsx                # header + navegação, enxuto (só este produto)
    ui/                          # shadcn (new-york), só os componentes usados aqui
  db/
    schema.ts   # schema Drizzle podado — só as tabelas deste produto (ver lista abaixo)
    client.ts   # cliente Postgres (drizzle-orm/postgres-js), genérico
scripts/
  create-user.ts  # cria o platform admin inicial + a org "Triad Company" (sem signup ainda)
drizzle/        # migração inicial (banco próprio, separado do Gestor de Tráfego)
docs/           # specs de design (funil, funil visual, scaffolding SaaS)
```

### Tabelas em `schema.ts`

`organizations`, `users`, `profiles`, `app_config` (config por organização — hoje só a chave da OpenAI), `instagram_connections`, `instagram_funnel_rules`, `instagram_funnel_leads`, `instagram_funnels`, `instagram_funnel_nodes`, `instagram_funnel_edges`, `instagram_funnel_sessions`.

## O que falta pra virar SaaS de verdade

Resolvido no scaffolding (não precisa mais fazer): projeto TanStack Start + Nitro rodável, handlers do webhook/arquivo registrados, componentes shadcn/ui, `AppShell`, deps de npm (`@xyflow/react`, `openai`, `bcryptjs`, `jsonwebtoken`), `.env.example`, banco próprio com migração inicial.

Ainda falta (próximas fases — ver `docs/2026-09-22-saas-scaffolding-design.md`):

1. **Auth self-service e multi-tenant de verdade** — hoje só existe `scripts/create-user.ts` (cria o platform admin inicial + a org "Triad Company"), não há tela de cadastro. `session.ts` resolve `organizationId`/`isPlatformAdmin` a partir de um cookie JWT, mas o gate `isPlatformAdmin` trava o funil pra uso só da Triad Company — precisa sair, e o fluxo de signup/organização por cliente precisa ser desenhado.
2. **Conexão do Instagram via OAuth** — hoje ainda é colar token de longa duração à mão (`admin.instagram-conexao.tsx`); precisa virar "Login with Instagram" de verdade.
3. **Meta Developers**: cada tenant precisaria de App Review da Meta pra sair do modo "Standard Access" (hoje funciona sem review só porque a conta é adicionada manualmente como Tester no app da Triad — não escala pra SaaS multi-cliente).
4. **Billing** — se/quando for cobrar dos clientes.

## Referência rápida da API do Instagram usada

- Host: `https://graph.instagram.com` (fluxo "Instagram Login", sem Facebook Page — **não** `graph.facebook.com`).
- Permissões: `instagram_business_basic` + `instagram_business_manage_messages` (mensagens); `instagram_business_manage_comments` (resposta pública a comentário).
- Resposta privada a comentário: `POST /{ig-business-id}/messages` com `{recipient: {comment_id}, message: {text}}` — 1 por comentário, até 7 dias depois.
- DM numa conversa já aberta: mesmo endpoint com `{recipient: {id: igUserId}, message: {...}}`.
- Anexo (ex. PDF): `{recipient: {id}, message: {attachment: {type: "file", payload: {url}}}}` — a Meta busca a URL, precisa ser pública, até 25MB.
- Resposta pública a comentário: `POST /{comment-id}/replies` com `{message}`.
- Webhook: `entry[].changes[]` (campo `comments`) pra comentários; `entry[].messaging[]` pra DMs — filtrar `message.is_echo` pra não reprocessar a própria mensagem enviada.
