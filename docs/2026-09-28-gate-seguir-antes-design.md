# DirectFlow — Fase 9: Gate "seguir antes de responder"

## Motivação

Pedido do usuário: antes de mandar a mensagem automática de uma regra, dá
pra exigir que a pessoa siga a conta primeiro. Se não seguir, manda um
aviso pedindo pra seguir, com um botão "Já segui" — e repete o aviso se
ela clicar sem ter seguido de verdade.

## Escopo (decidido no brainstorming)

- Configurável por regra (switch "Exigir seguir antes de responder"),
  não é um toggle global da organização.
- Sem limite de tentativas — repete o aviso quantas vezes a pessoa clicar
  em "Já segui" sem ter seguido.
- Texto fixo do sistema (não editável por regra), no formato de button
  template: texto + botão "Ver perfil" (abre o perfil) + botão "Já segui".

## Descoberta técnica

O botão "Ver perfil" exige um **button template** (`attachment.type:
"template"`, `template_type: "button"`), que suporta misturar um botão
`web_url` com um `postback` — até 3 botões, texto até 640 caracteres.
Documentado em
`https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template/`.

Clique num botão `postback` chega por um webhook **separado** do
`messages` já usado hoje: o app precisa estar inscrito também no campo
`messaging_postbacks`. O evento chega em `entry[].messaging[]`, mas com
`postback: { title, mid, payload }` no lugar de `message` — mutuamente
exclusivos.

Checar se a pessoa segue usa o mesmo endpoint de perfil já usado pra
buscar username (`fetchInstagramUsername`, adicionado na Fase 7.1):
`GET /{ig-user-id}?fields=is_user_follow_business&access_token=...`.

## Passo manual — Meta App Dashboard

Antes do deploy funcionar de ponta a ponta, é preciso inscrever o app no
campo `messaging_postbacks`:

1. developers.facebook.com → seu app → Instagram → Configuração da API →
   Webhooks (ou "Instagram Business Login" → Webhooks, mesma tela onde
   `messages`/`comments` já estão marcados).
2. Marcar também `messaging_postbacks`.
3. Salvar.

Sem esse passo, o clique em "Já segui" nunca chega no servidor.

## Schema

```
instagram_funnel_rules
  + require_follow boolean not null default false

instagram_follow_gates (nova)
  id, organization_id (FK cascade), ig_user_id,
  lead_id (FK -> instagram_funnel_leads, cascade), created_at
  UNIQUE(organization_id, ig_user_id)  -- só um gate pendente por contato,
                                        -- mesmo padrão de instagram_funnel_sessions
```

`instagram_funnel_leads.status` ganha um terceiro valor possível,
`"pending_follow"` (coluna já é texto livre, sem migração de enum).

## Motor (`instagram-webhook.ts`)

**Textos e botões fixos:**

```
Primeira vez:
"Falta só um passo: me segue aqui no perfil 👀

Assim que seguir, clica em 'Já segui' que eu libero sua mensagem na hora 👇"

Repetição (já clicou mas ainda não segue):
"Ainda não te encontrei seguindo 👀 segue rapidinho que eu libero na hora!"

Botões (os dois casos):
- "Ver perfil 👀" — web_url pro perfil da conta conectada
  (username buscado via fetchInstagramUsername no próprio ID da conexão)
- "Já segui 💙" — postback, payload fixo "gate:confirm_follow"
```

**`processComment` / `processStoryReply`** — depois de casar a regra, antes
de mandar a mensagem:
- Se `rule.requireFollow`: checa `fetchIsUserFollowing`.
  - Já segue: segue o fluxo normal (sem mudança nenhuma).
  - Não segue: insere o lead com `status: "pending_follow"` (mesma
    proteção de dedupe por `ruleId`+`commentId` de sempre), manda o gate
    (texto "primeira vez"), grava/atualiza `instagram_follow_gates`
    (upsert por `organizationId`+`igUserId`), e **retorna sem mandar a
    mensagem da regra nem entrar no funil** — isso só acontece depois de
    confirmado.

**Novo: tratamento de `postback` na malha principal.** Hoje o loop de
`entry.messaging` só olha `event.message` — passa a checar
`event.postback?.payload` primeiro; se for `"gate:confirm_follow"`, chama
`resolveFollowGate(igBusinessAccountId, senderId)` e não passa pelo resto
do processamento de mensagem (postback não é uma mensagem de texto).

**`resolveFollowGate`**:
1. Acha a conexão pelo `igBusinessAccountId`; acha o gate pendente por
   `(organizationId, igUserId)` — se não achar (clique órfão/repetido),
   ignora.
2. Checa `fetchIsUserFollowing` de novo.
3. Segue: apaga o gate, busca o lead (`gate.leadId`) e a regra
   (`lead.ruleId`), manda a mensagem original da regra via
   `sendDirectMessage` (não `sendPrivateReply` — a essa altura já existe
   uma conversa de Direct aberta, não precisa mais do vínculo com o
   comentário original), atualiza `lead.status` pra `"sent"`/`"failed"`,
   loga via `logMessage`, e entra no funil se a regra tiver um
   (`enterFunnelIfConfigured`, ver abaixo).
4. Não segue: manda o aviso "repetição", mantém o gate como está.

**Reaproveitamento**: a lógica de "entrar no funil se a regra tiver
`funnelId`" hoje está duplicada em `processComment` e `processStoryReply`
— extraída pra uma função `enterFunnelIfConfigured(rule, connection,
igBusinessAccountId, igUserId, leadId)` compartilhada pelos três lugares
que precisam dela agora (as duas originais + `resolveFollowGate`).

## UI (`admin.instagram-funil.tsx` — formulário de regra)

Novo switch "Exigir seguir antes de responder" no formulário de
criar/editar regra (funciona pra Comentário e Resposta a story).

## Critério de pronto

- Migração aplicada, build/typecheck sem erro.
- Regra com o gate desligado continua funcionando exatamente como antes.
- Regra com o gate ligado, testada com uma conta que **não segue**: chega
  o aviso com os dois botões, nenhuma mensagem da regra ainda.
- Clicar em "Já segui" sem seguir: chega o aviso de repetição.
- Seguir de verdade e clicar em "Já segui": chega a mensagem original da
  regra (e entra no funil, se configurado); o lead vira "enviado" em
  Leads/Contatos.
