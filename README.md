# manychat-triad (produto: **DirectFlow**)

Funil de vendas via Instagram (comentário → Direct → fluxo em blocos) — extraído do app interno **gestor-trafego-triad** como ponto de partida pra virar um produto próprio, hoje comercializado como **DirectFlow** (nome de marca; o repositório/pacote ainda não foi rebatizado no código).

Ideia original: dentro do Instagram, quando alguém comenta uma palavra-chave num post (ou responde a um story) o sistema manda uma mensagem no Direct automaticamente (tipo Manychat) e a conversa pode seguir por um funil visual (blocos de Gatilho → Mensagem → Condição → Botões, com ramificação por palavra-chave, IA ou clique em botão).

## Estado deste repositório

Projeto TanStack Start + Nitro independente, roda sozinho (`npm run dev` / `npm run build && npm start`) com banco Postgres próprio, separado do app original. Ver `docs/2026-09-22-saas-scaffolding-design.md` pro design dessa fase.

Qualquer empresa já consegue se cadastrar em `/cadastro`, usar o funil isolada das demais, e conectar a própria conta do Instagram clicando em um botão — sem colar token à mão (ver `docs/2026-09-22-saas-self-service-auth-design.md` e `docs/2026-09-22-instagram-oauth-design.md`). O que falta pra abrir pra qualquer cliente de verdade é o App Review da Meta (processo com a Meta, não código — ver "O que falta" abaixo).

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

Se já tinha um banco de antes, rode `npm run db:migrate` de novo pra pegar
as migrações que faltam: `drizzle/0001_daily_venus.sql` (bloco Botões, Fase
4) e `drizzle/0002_robust_blazing_skull.sql` (gatilho Resposta ao story,
Fase 6).

## Estrutura

```
src/
  server/
    instagram-funnel.ts        # CRUD de conexão, regras, funis, leads (session-gated, qualquer organização)
    instagram-webhook.ts       # motor de execução — recebe comentário/DM da Meta, roda o funil
    instagram-webhook.route.ts # handler Nitro/h3 do webhook (verificação + validação HMAC)
    instagram-files.route.ts   # serve anexo (ex: PDF) de um bloco de mensagem pra Meta buscar
    instagram-oauth.ts         # helpers do fluxo OAuth (troca code -> token curto -> longo, renovação)
    instagram-connect.route.ts   # GET /api/instagram/connect — inicia o "Conectar Instagram"
    instagram-callback.route.ts  # GET /api/instagram/callback — troca o code, salva a conexão
    instagram-refresh-tokens.route.ts  # GET /api/instagram/refresh-tokens — renovação via cron externo
    session.ts                 # auth (JWT em cookie) — login, signup (self-service), sessão
    settings.ts                 # chave da OpenAI por organização (app_config)
  lib/
    auth.ts                    # bcrypt + JWT (assinar/verificar sessão) usado por session.ts
    utils.ts                    # helper cn() do shadcn
  routes/
    __root.tsx                            # shell HTML, providers, guard de sessão
    login.tsx / cadastro.tsx / index.tsx  # login, cadastro self-service, redirect pra /admin/inicio
    admin.inicio.tsx                      # saudação + status da conexão + atalhos
    admin.contatos.tsx / admin.caixa-entrada.tsx  # placeholders "Em breve"
    admin.instagram-conexao.tsx           # redirect puro pra /admin/configuracoes (rota antiga)
    admin.instagram-funil.tsx             # abas Regras / Funis / Leads ("Automação" na navegação)
    admin.instagram-funil-editor.$funnelId.tsx  # editor visual (React Flow) dos blocos do funil
    admin.configuracoes.tsx               # abas: Conexão Instagram + chave da OpenAI
  components/
    AppShell.tsx                # barra lateral (estilo ManyChat) — Início/Contatos/Automação/Caixa de Entrada/Configurações
    EmBreve.tsx                  # placeholder compartilhado das seções ainda não construídas
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

Resolvido: scaffolding, cadastro self-service + multi-tenant sem gate de platform admin, e conexão do Instagram via OAuth (ver `docs/2026-09-22-saas-scaffolding-design.md`, `docs/2026-09-22-saas-self-service-auth-design.md` e `docs/2026-09-22-instagram-oauth-design.md`).

Ainda falta:

1. **App Review da Meta**: hoje o fluxo OAuth só funciona pra contas cadastradas manualmente como Tester do app (modo "Standard Access"/Development). Pra qualquer cliente conseguir clicar em "Conectar Instagram" e funcionar, o app precisa passar pela revisão da Meta das permissões `instagram_business_basic`/`instagram_business_manage_messages`/`instagram_business_manage_comments` — processo com a Meta, não código, mas depende do fluxo OAuth funcionando de verdade (vídeo de demo).
2. **Cron de renovação de token**: o endpoint `/api/instagram/refresh-tokens` existe, mas o agendamento em si (workflow n8n batendo nele 1x/dia) ainda precisa ser configurado.
3. **Billing** — se/quando for cobrar dos clientes.
4. **Recuperação de senha self-service** — hoje é `scripts/reset-password.ts` rodado por vocês; precisa de envio de email pra virar self-service (mesma dependência que falta pra verificação de email no cadastro).
5. **Estrutura estilo ManyChat** — navegação lateral (Início/Contatos/Automação/Caixa de Entrada/Configurações) já implementada (ver `docs/2026-09-25-navegacao-lateral-manychat-design.md`); Contatos e Caixa de Entrada hoje são só placeholder "Em breve", sem funcionalidade real ainda.
6. **Automation mais rico** — bloco Botões (quick replies, ver `docs/2026-09-23-funil-botoes-resposta-rapida-design.md`) e gatilho "Resposta ao story" (ver `docs/2026-09-25-gatilho-resposta-story-design.md`) já implementados; Insights/analytics por automação, Smart Delay, Ir para outro funil e Tags seguem no roadmap. **Decisão**: o editor visual em blocos (React Flow) continua sendo o único jeito de montar o funil — não vira um assistente em formato de wizard, mesmo que o ManyChat ofereça essa opção mais simples também.

## Referência rápida da API do Instagram usada

- Host: `https://graph.instagram.com` pras chamadas de dados/mensagens (fluxo "Instagram Login", sem Facebook Page — **não** `graph.facebook.com`); `https://www.instagram.com/oauth/authorize` pra autorização e `https://api.instagram.com/oauth/access_token` pra trocar o code pelo token curto (ver `instagram-oauth.ts`).
- Permissões: `instagram_business_basic` + `instagram_business_manage_messages` (mensagens); `instagram_business_manage_comments` (resposta pública a comentário).
- Resposta privada a comentário: `POST /{ig-business-id}/messages` com `{recipient: {comment_id}, message: {text}}` — 1 por comentário, até 7 dias depois.
- DM numa conversa já aberta: mesmo endpoint com `{recipient: {id: igUserId}, message: {...}}`.
- Anexo (ex. PDF): `{recipient: {id}, message: {attachment: {type: "file", payload: {url}}}}` — a Meta busca a URL, precisa ser pública, até 25MB.
- Resposta a story: chega no mesmo webhook de mensagens (campo `messages`, já assinado — sem inscrição extra), com `message.reply_to.story = {id, url}` em vez de `reply_to.mid` (resposta a mensagem normal).
- Resposta pública a comentário: `POST /{comment-id}/replies` com `{message}`.
- Webhook: `entry[].changes[]` (campo `comments`) pra comentários; `entry[].messaging[]` pra DMs — filtrar `message.is_echo` pra não reprocessar a própria mensagem enviada.
