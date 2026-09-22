# manychat-triad como SaaS — Fase 1: scaffolding

## Motivação

Este repositório hoje é só código copiado como referência do app interno
`gestor-trafego-triad` — não builda nem roda sozinho (ver README). O
objetivo de longo prazo é transformar o funil de vendas via Instagram num
SaaS vendável: qualquer empresa se cadastra, conecta a própria conta do
Instagram e usa o funil isolada dos outros clientes.

Esse objetivo maior foi quebrado em fases, porque envolve subsistemas
independentes (scaffolding, auth self-service, OAuth do Instagram, billing).
Este spec cobre só a **Fase 1: scaffolding** — fazer o projeto rodar de
forma independente. É a fase bloqueante: nenhuma das outras é testável de
verdade sem isso.

**Fora de escopo nesta fase** (fica pras próximas): tela de cadastro/signup,
remoção do gate de platform admin, fluxo de conexão do Instagram via OAuth,
billing. Ao final desta fase o app se comporta exatamente como hoje — só a
Triad Company loga, só platform admin usa o funil — mas como projeto
independente, não mais acoplado ao app original.

## Achado importante: o modelo de dados já é multi-tenant

Inspecionando `src/server/session.ts` e `src/server/instagram-funnel.ts`:
toda tabela relevante já tem `organizationId`, e toda server function do
funil já escopa suas queries via `requireOrgContext()`. O isolamento de
dados entre organizações já existe estruturalmente — o que falta pra virar
SaaS é o *fluxo de acesso* (cadastro, remover o gate hardcoded de platform
admin, conectar Instagram sem colar token à mão), não o modelo de dados em
si.

## Deploy e banco

- **Deploy**: VPS via EasyPanel + Docker, mesmo padrão já usado no Gestor de
  Tráfego (ver `project_gestor_trafego_postgres_migration`). Usar o plugin
  `nitro/vite` no `vite.config.ts` — uma integração manual com `srvx` já
  travou silenciosamente em produção da última vez (chamada RPC do client
  nunca resolvia, sem erro nenhum); ver
  `feedback_tanstack_start_node_deploy_nitro`. Build final roda com
  `node .output/server/index.mjs`.
- **Banco**: Postgres próprio, separado do banco do Gestor de Tráfego —
  manychat-triad é um produto independente, não precisa herdar as ~30
  tabelas do CRM original que não têm nada a ver com o funil.

## Stack e dependências

Referência: `package.json` e `vite.config.ts` de `gestor-trafego-triad`
(também público), cruzado com os imports reais dos arquivos já copiados
neste repo (`grep -rhoE 'from "[^"]+"'` em `src/`).

Dependências de runtime a manter (versões conforme o `package.json` de
referência):

- `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-query`
- `nitro` (via plugin `nitro/vite`)
- `drizzle-orm`, `postgres`
- `@xyflow/react` (editor visual do funil)
- `bcryptjs`, `jsonwebtoken` (auth atual — mantido como está nesta fase)
- `openai` (classificação por IA nos blocos de Condição)
- `zod`, `sonner`, `lucide-react`
- `@tailwindcss/vite`, `tailwindcss`, `tw-animate-css`
- shadcn: só os primitivos radix usados pelas telas —
  `@radix-ui/react-dialog`, `@radix-ui/react-label`,
  `@radix-ui/react-select`, `@radix-ui/react-switch`,
  `@radix-ui/react-tabs`, `@radix-ui/react-slot`,
  `class-variance-authority`, `clsx`, `tailwind-merge`

Removido em relação ao `package.json` original (pertence a outras partes do
CRM, não usado em nenhum arquivo deste repo): `leaflet`/`react-leaflet`,
`react-big-calendar`, `jspdf`, `recharts`, `@react-oauth/google`,
`embla-carousel-react`, `input-otp`, `cmdk`, `vaul`,
`react-resizable-panels`, `date-fns`, `react-hook-form`,
`@hookform/resolvers`, `@fontsource/*`, e todos os `@radix-ui/*` não usados
pelas telas copiadas (accordion, alert-dialog, avatar, checkbox,
dropdown-menu, popover, tooltip etc.).

Dev: `vite`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `drizzle-kit`,
`typescript`, `@types/node`, `@types/react`, `@types/react-dom`,
`@types/bcryptjs`, `@types/jsonwebtoken`.

## Schema do banco

`src/db/schema.ts` hoje tem 937 linhas / ~30 tabelas do CRM inteiro. Poda
pra ficar só com:

`organizations`, `users`, `profiles`, `app_config`, `instagram_connections`,
`instagram_funnel_rules`, `instagram_funnels`, `instagram_funnel_nodes`,
`instagram_funnel_edges`, `instagram_funnel_leads`,
`instagram_funnel_sessions` — e as relations correspondentes a essas
tabelas.

`app_config` (chave/valor por organização) entrou na lista porque
`instagram-webhook.ts` consulta
`appConfig.findFirst({ where: { organizationId, key: "openai_api_key" } })`
pra buscar a chave da OpenAI usada na classificação por IA — sem essa
tabela a query quebra em vez de degradar graciosamente pro casamento por
palavra-chave (comportamento hoje esperado quando a chave não está
configurada).

As migrações em `drizzle/` (`0022` a `0026`) já são só dessas tabelas —
não precisam mudar.

## Estrutura de arquivos e handlers Nitro

Criar do zero (não vieram no repo): `package.json`, `vite.config.ts`,
`tsconfig.json`, `src/router.tsx`, `src/styles.css` (Tailwind 4 + tokens
shadcn), `.env.example`, `drizzle.config.ts`.

Handlers Nitro registrados direto no `vite.config.ts` (não passam pelo
roteador normal — README já documenta isso):

```ts
nitro({
  handlers: [
    { route: "/api/webhooks/instagram", handler: "./src/server/instagram-webhook.route.ts" },
    { route: "/api/instagram-files/:nodeId", method: "GET", handler: "./src/server/instagram-files.route.ts" },
  ],
})
```

Componentes shadcn (`badge`, `button`, `card`, `dialog`, `input`, `label`,
`select`, `skeleton`, `switch`, `table`, `tabs`, `textarea`) regenerados via
`npx shadcn add`, não escritos à mão — mantém consistência com o padrão
usado no resto dos produtos da Triad.

## AppShell mínimo

O `AppShell` do app original tem 334 linhas de navegação do CRM inteiro
(Clientes, Tarefas, Vendas, Agenda, toggle de tema, widget de agente IA) —
nada disso existe neste produto. Construir um shell novo e enxuto:
header simples com nome do produto, 2 links (Conexão Instagram / Funil) +
o novo Configurações, botão de logout. Sem toggle de tema nesta fase (só
claro) — não bloqueia adicionar depois.

## Tela de Configurações (novo, mínimo)

Rota `/admin/configuracoes`: um único campo pra colar a chave da API da
OpenAI, salvo via upsert em `app_config` (chave `openai_api_key`), escopado
por `requireOrgContext()` igual ao resto do funil. Sem mais nada nesta
tela por enquanto — é só o que falta pra `classifyReplyWithAI` funcionar
sem precisar inserir direto no banco.

## Variáveis de ambiente

`.env.example` com as 5 já documentadas no README: `DATABASE_URL`,
`JWT_SECRET`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`,
`APP_URL`. A chave da OpenAI não entra aqui — é por organização, vive no
banco (`app_config`), configurada pela tela acima.

## Criação do primeiro usuário

Sem signup ainda (Fase 2). Recriar `scripts/create-user.ts` (citado no
README, não copiado) rodável via `tsx`, pra criar o platform admin inicial
+ a organização "Triad Company", do jeito que já funciona no app original.

## Critério de pronto

- `npm run build` sem erro de tipo.
- `npm run dev` sobe local e `npm run build && npm start` builda/roda em
  modo produção.
- Login funciona (usuário criado via script).
- `/admin/instagram-conexao`, `/admin/instagram-funil`,
  `/admin/instagram-funil-editor/:funnelId` e `/admin/configuracoes`
  renderizam sem erro (mesmo sem dado real ainda).
- Nenhuma mudança de comportamento em relação ao app original além de
  rodar isolado — mesmo gate de platform admin, mesmo fluxo manual de
  conexão do Instagram.
