# manychat-triad

Funil de vendas via Instagram (comentário → Direct → fluxo em blocos) — extraído do app interno **gestor-trafego-triad** como ponto de partida pra virar um produto próprio.

Ideia original: dentro do Instagram, quando alguém comenta uma palavra-chave num post, o sistema manda uma mensagem no Direct automaticamente (tipo Manychat) e a conversa pode seguir por um funil visual (blocos de Gatilho → Mensagem → Condição, com ramificação por palavra-chave ou por IA).

## Estado deste repositório

Projeto TanStack Start + Nitro independente, roda sozinho (`npm run dev` / `npm run build && npm start`) com banco Postgres próprio, separado do app original. Ver `docs/2026-09-22-saas-scaffolding-design.md` pro design dessa fase.

Qualquer empresa já consegue se cadastrar em `/cadastro` e usar o funil isolada das demais — o gate que travava tudo só pra Triad Company saiu (ver `docs/2026-09-22-saas-self-service-auth-design.md`). O que ainda falta pra virar SaaS de verdade é a conexão do Instagram, que continua manual (colar token gerado à mão) — precisa virar OAuth de verdade, próxima fase.

### Rodando local

```
cp .env.example .env   # preencha DATABASE_URL e os demais
npm install
npm run db:migrate     # aplica as migrações em drizzle/
npm run dev
```

Depois, crie uma conta em `/cadastro` (self-service) ou, se precisar do
platform admin inicial (Triad Company): `npm run create-user -- voce@exemplo.com "sua-senha" "Seu Nome"`.
Recuperação de senha ainda é manual: `npm run reset-password -- email nova-senha`.

## Estrutura

```
src/
  server/
    instagram-funnel.ts        # CRUD de conexão, regras, funis, leads (session-gated, qualquer organização)
    instagram-webhook.ts       # motor de execução — recebe comentário/DM da Meta, roda o funil
    instagram-webhook.route.ts # handler Nitro/h3 do webhook (verificação + validação HMAC)
    instagram-files.route.ts   # serve anexo (ex: PDF) de um bloco de mensagem pra Meta buscar
    session.ts                 # auth (JWT em cookie) — login, signup (self-service), sessão
    settings.ts                 # chave da OpenAI por organização (app_config)
  lib/
    auth.ts                    # bcrypt + JWT (assinar/verificar sessão) usado por session.ts
    utils.ts                    # helper cn() do shadcn
  routes/
    __root.tsx                            # shell HTML, providers, guard de sessão
    login.tsx / cadastro.tsx / index.tsx  # login, cadastro self-service, redirect pra /admin/instagram-funil
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
  create-user.ts     # cria o platform admin inicial + a org "Triad Company"
  reset-password.ts  # recuperação de senha manual (sem email self-service ainda)
drizzle/        # migração inicial (banco próprio, separado do Gestor de Tráfego)
docs/           # specs de design (funil, funil visual, scaffolding SaaS, auth self-service)
```

### Tabelas em `schema.ts`

`organizations`, `users`, `profiles`, `app_config` (config por organização — hoje só a chave da OpenAI), `instagram_connections`, `instagram_funnel_rules`, `instagram_funnel_leads`, `instagram_funnels`, `instagram_funnel_nodes`, `instagram_funnel_edges`, `instagram_funnel_sessions`.

## O que falta pra virar SaaS de verdade

Resolvido: scaffolding (projeto TanStack Start + Nitro rodável, banco próprio) e cadastro self-service + multi-tenant sem gate de platform admin (ver `docs/2026-09-22-saas-scaffolding-design.md` e `docs/2026-09-22-saas-self-service-auth-design.md`).

Ainda falta:

1. **Conexão do Instagram via OAuth** — hoje ainda é colar token de longa duração à mão (`admin.instagram-conexao.tsx`); precisa virar "Login with Instagram" de verdade, senão cada cliente novo depende de vocês gerando o token pra ele.
2. **Meta Developers**: cada tenant precisaria de App Review da Meta pra sair do modo "Standard Access" (hoje funciona sem review só porque a conta é adicionada manualmente como Tester no app da Triad — não escala pra SaaS multi-cliente).
3. **Billing** — se/quando for cobrar dos clientes.
4. **Recuperação de senha self-service** — hoje é `scripts/reset-password.ts` rodado por vocês; precisa de envio de email pra virar self-service (mesma dependência que falta pra verificação de email no cadastro).

## Referência rápida da API do Instagram usada

- Host: `https://graph.instagram.com` (fluxo "Instagram Login", sem Facebook Page — **não** `graph.facebook.com`).
- Permissões: `instagram_business_basic` + `instagram_business_manage_messages` (mensagens); `instagram_business_manage_comments` (resposta pública a comentário).
- Resposta privada a comentário: `POST /{ig-business-id}/messages` com `{recipient: {comment_id}, message: {text}}` — 1 por comentário, até 7 dias depois.
- DM numa conversa já aberta: mesmo endpoint com `{recipient: {id: igUserId}, message: {...}}`.
- Anexo (ex. PDF): `{recipient: {id}, message: {attachment: {type: "file", payload: {url}}}}` — a Meta busca a URL, precisa ser pública, até 25MB.
- Resposta pública a comentário: `POST /{comment-id}/replies` com `{message}`.
- Webhook: `entry[].changes[]` (campo `comments`) pra comentários; `entry[].messaging[]` pra DMs — filtrar `message.is_echo` pra não reprocessar a própria mensagem enviada.
