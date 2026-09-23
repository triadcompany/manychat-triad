# manychat-triad como SaaS — Fase 3: conexão do Instagram via OAuth

## Motivação

A Fase 2 (ver `docs/2026-09-22-saas-self-service-auth-design.md`) liberou o
cadastro self-service, mas a tela `/admin/instagram-conexao` ainda pede pra
colar à mão um `access_token` de longa duração gerado manualmente no Meta
Developers. Isso não escala: cada cliente novo dependeria de vocês gerando o
token pra ele. Esta fase troca isso por um fluxo "Login with Instagram" de
verdade — o próprio cliente clica em "Conectar Instagram", autoriza, e o
sistema salva o token sozinho.

**Contexto já confirmado** (não muda nesta fase): o motor do webhook
(`instagram-webhook.ts`) já resolve a organização a partir do
`entry[].id` do evento contra `instagram_connections.instagramBusinessAccountId`
e já filtra por `connection.active` — um único app da Meta atende todas as
organizações, sem mudança nenhuma no motor. App Review de verdade (sair do
modo só-Tester) é processo separado com a Meta, fora de escopo aqui, mas
depende deste fluxo estar funcionando (a Meta pede vídeo de demo do OAuth
real antes de aprovar). A BM "Triad Company" já está verificada, cobrindo a
exigência de Business Verification.

## Fluxo de conexão

Dois handlers Nitro novos, registrados em `vite.config.ts` no mesmo padrão de
`instagram-webhook.route.ts`/`instagram-files.route.ts`:

**`GET /api/instagram/connect`** — exige sessão (`requireOrgContext()`).
Gera um `state` aleatório (proteção CSRF padrão de OAuth), grava num cookie
de curta duração (`httpOnly`, alguns minutos de validade), e redireciona pra:

```
https://www.instagram.com/oauth/authorize
  ?client_id={INSTAGRAM_APP_ID}
  &redirect_uri={APP_URL}/api/instagram/callback
  &scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments
  &response_type=code
  &state={state}
```

**`GET /api/instagram/callback`** — recebe `code` + `state` da Meta (ou
`error` se o usuário cancelou a autorização). Fluxo:

1. Se veio `error` na query: redireciona pra
   `/admin/instagram-conexao?error=cancelado` (sem chamar a Meta).
2. Confere o `state` recebido contra o valor gravado no cookie — não bate,
   redireciona com `?error=state_invalido`.
3. Troca `code` por token de curta duração:
   `POST https://api.instagram.com/oauth/access_token` (form-encoded:
   `client_id`, `client_secret`, `grant_type=authorization_code`,
   `redirect_uri`, `code`).
4. Troca o token curto pelo de longa duração (60 dias):
   `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={INSTAGRAM_APP_SECRET}&access_token={token_curto}`.
5. Busca a conta: `GET https://graph.instagram.com/me?fields=id,username&access_token={token_longo}`.
6. Upsert em `instagram_connections` pra organização da sessão (reativa a
   linha existente se houver — mesma lógica de "uma linha por organização"
   que `_upsertInstagramConnection` já tem hoje — ou cria uma nova), com
   `instagramBusinessAccountId`, `accessToken`, `expiresAt` (agora + 60
   dias), `active: true`.
7. Redireciona pra `/admin/instagram-conexao?connected=1`.

Qualquer falha nos passos 3–6 (erro de rede, resposta inesperada da Meta)
redireciona pra `/admin/instagram-conexao?error=falha_conexao` em vez de
estourar um 500 pro usuário.

O botão "Conectar Instagram" na tela é um link (`<a href="/api/instagram/connect">`),
não uma chamada RPC — precisa ser navegação de verdade pro redirect OAuth
funcionar.

## Renovação automática

**`GET /api/instagram/refresh-tokens`** — protegido por header
`x-automation-secret` contra a env var `AUTOMATION_SECRET` (mesmo padrão do
`automations-tick.route.ts` do Gestor de Tráfego: sem o header correto,
`401`). Sem sessão de usuário — roda cross-org. Busca toda
`instagram_connections` com `active: true` e `expiresAt` a menos de 10 dias
de vencer; pra cada uma, chama
`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={token_atual}`
e atualiza `accessToken`/`expiresAt`. Falha numa conexão não interrompe as
demais (best-effort, log de erro por conexão). A configuração do cron em si
(workflow n8n batendo esse endpoint 1x/dia) fica com vocês — aqui só o
endpoint e o contrato (header + resposta).

## Desconectar

Nova server function `disconnectInstagram` em `instagram-funnel.ts`, mesmo
padrão de `requireOrgContext()` das demais: marca a linha existente da
organização com `active: false`. Não apaga a linha — preserva quando foi
conectada a primeira vez. Reconectar depois reativa essa mesma linha (upsert
do passo 6 acima).

## Tela `/admin/instagram-conexao`

O formulário de colar `access_token`/`instagram_business_account_id` sai
inteiro. No lugar:

- **Não conectado**: botão "Conectar Instagram" (link pro
  `/api/instagram/connect`), mais a explicação de que a permissão é pedida
  direto na tela do Instagram.
- **Conectado**: mesmo card de status de hoje (conta linkada, data de
  expiração do token, aviso se expira em breve) + botão "Desconectar".
- Trata `?connected=1` (toast de sucesso) e `?error=...` (toast de erro com
  mensagem amigável por código: `cancelado`, `state_invalido`,
  `falha_conexao`) — limpa a query string da URL depois de mostrar.

## Variáveis de ambiente novas

- `INSTAGRAM_APP_ID` — client_id do app na Meta (público, vai na URL de
  autorização). Não existia nenhuma env var pra isso até agora, só o
  `INSTAGRAM_APP_SECRET` (usado pra validar assinatura do webhook).
- `AUTOMATION_SECRET` — protege o endpoint de renovação.

## Critério de pronto

- `npm run build` e `tsc --noEmit` sem erro.
- Fluxo completo testado manualmente contra uma conta de teste (Tester do
  app, já que ainda não passou por App Review): clicar "Conectar Instagram"
  → autorizar na Meta → voltar autenticado com a conexão salva e ativa.
- Cancelar a autorização do lado da Meta volta pra tela com mensagem de erro
  amigável, sem 500.
- "Desconectar" marca `active: false`; o botão "Conectar Instagram" volta a
  aparecer; reconectar reativa a mesma linha.
- `/api/instagram/refresh-tokens` sem o header correto responde `401`; com o
  header correto, roda sem erro mesmo sem nenhuma conexão pra renovar.
