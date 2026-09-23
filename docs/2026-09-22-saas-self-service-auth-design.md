# manychat-triad como SaaS — Fase 2: cadastro self-service e remoção do gate de platform admin

## Motivação

A Fase 1 (scaffolding, ver `docs/2026-09-22-saas-scaffolding-design.md`) deixou o
projeto rodando de forma independente, mas com o comportamento idêntico ao app
original: só a Triad Company usa (`requirePlatformAdminOrg()` exige
`isPlatformAdmin`), e o único jeito de criar uma conta é rodando
`scripts/create-user.ts` na mão. Esta fase resolve o bloqueio nº1 pra virar
produto vendável: **qualquer empresa consegue criar a própria conta e usar o
funil, isolada das demais**, sem depender de vocês rodando script nenhum.

**Fora de escopo nesta fase** (decidido no brainstorming): convite de equipe —
por enquanto é 1 usuário por organização, quem se cadastra vira admin da
própria organização sozinho; verificação de email; qualquer envio de email
(nem verificação, nem recuperação de senha); painel do platform admin pra
listar/gerenciar organizações.

## Cadastro

Rota nova `/cadastro` (pública — entra na lista de exceções do guard de sessão
em `src/routes/__root.tsx`, junto com `/login`). Campos: nome da empresa, nome
completo, email, senha (mínimo 8 caracteres, mesma regra já usada em
`changePassword`).

Nova função `signup` em `src/server/session.ts`, dentro de uma transação
(`db.transaction`) — três inserts dependentes (organização → usuário →
profile); numa falha no meio, a transação desfaz tudo, evitando organização
órfã sem usuário:

1. Insere em `organizations` com o nome informado.
2. Insere em `users` (`isPlatformAdmin: false`, senha com `hashPassword`).
3. Insere em `profiles` com `role: "admin"` e `organizationId` apontando pra
   organização recém-criada.

Email duplicado (constraint `users.email` já é `unique`) vira erro amigável
"Este email já está cadastrado." em vez do erro cru do Postgres. Ao final,
seta o cookie de sessão (mesmo `signSessionToken` que `login` usa) e devolve
o `SessionUser` — a tela redireciona pro funil, sem precisar logar de novo.

**Limpeza correlata**: a função `createUser` existente em `session.ts` não é
usada em lugar nenhum — nem por UI, nem pelo `scripts/create-user.ts` (que já
insere direto no banco via Drizzle) — e o comentário dela afirma o contrário.
Como esta fase já reescreve a vizinhança dela em `session.ts`, ela sai.

## Remoção do gate de platform admin

`requirePlatformAdminOrg()` (definida em `src/server/instagram-funnel.ts`,
usada em 12 server functions desse arquivo + 3 em `src/server/settings.ts`)
hoje é:

```ts
export async function requirePlatformAdminOrg(): Promise<{ organizationId: string }> {
  const { organizationId, isPlatformAdmin } = await requireOrgContext();
  if (!isPlatformAdmin) throw new Error("Acesso restrito ao platform admin.");
  return { organizationId };
}
```

Ela sai completamente, e as 15 chamadas viram `requireOrgContext()` direto
(já importada nos dois arquivos) — sem o check de `isPlatformAdmin`, a função
vira um wrapper que só repassa pra `requireOrgContext()`, indireção sem
propósito. Resultado: qualquer usuário autenticado pertencente a uma
organização usa o funil — não exige papel `admin` dentro da própria
organização (com 1 usuário por org, isso não muda nada na prática hoje, mas
não bloqueia quando convite de equipe existir numa fase futura).

`isPlatformAdmin` como coluna e conceito continua existindo (`users`,
`SessionUser`, `requirePlatformAdmin` em `session.ts`) — só para de ser
exigido pelo funil. `scripts/create-user.ts` continua criando usuários com
`isPlatformAdmin: true`; isso fica disponível pra uma eventual ferramenta de
suporte, fora de escopo agora.

As rotas de webhook (`instagram-webhook.route.ts`, `instagram-files.route.ts`)
não passam por sessão nenhuma (verificação própria via HMAC/token) — nada
muda nelas.

## Recuperação de senha (manual, sem email)

Novo `scripts/reset-password.ts`, mesmo padrão do `create-user.ts` (Postgres +
Drizzle direto, roda via `tsx --env-file=.env`): recebe email + nova senha,
localiza o usuário, atualiza `passwordHash`. Sem UI e sem envio de email —
suporte roda o script quando alguém pedir. Self-service (link por email) fica
pra quando o cadastro também ganhar verificação de email, numa fase futura.

## Critério de pronto

- `npm run build` e `tsc --noEmit` sem erro.
- Cadastro em `/cadastro` cria organização nova, loga automaticamente, e
  `/admin/instagram-conexao` funciona pro usuário recém-criado sem ele ser
  platform admin.
- Duas organizações diferentes (uma via `scripts/create-user.ts`, outra via
  `/cadastro`) não veem dado uma da outra.
- Email duplicado no cadastro mostra mensagem amigável, não erro cru.
- `scripts/reset-password.ts` atualiza a senha e login com a senha nova
  funciona.
