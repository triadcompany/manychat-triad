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

## Adendo 4 — bloco "Seguir" do funil ganhou texto/botões editáveis

Reverte parte da decisão original (texto fixo do sistema): agora o
**bloco do funil** (`follow_gate`) tem texto próprio (1ª vez e
repetição) e rótulo dos dois botões, editável via clique duplo — igual
aos outros blocos. Campo em branco cai pro texto/rótulo padrão do
sistema (`DEFAULT_GATE_CONTENT` em `instagram-webhook.ts`).

O **switch da regra** ("Exigir seguir antes de responder") continua com
o texto fixo — não tem bloco pra guardar customização, fora de escopo
por enquanto.

Schema: `instagram_funnel_nodes.follow_gate_config` (jsonb) guarda
`{ retry, confirmLabel, profileLabel }`; o texto da 1ª vez reaproveita a
coluna `message` já existente (mesmo padrão de Mensagem/Botões).

## Adendo — bloco "Seguir" no editor de funil

Pedido do usuário depois da primeira entrega: além do switch por regra
(que trava só a 1ª mensagem, antes do funil), poder colocar o mesmo gate
**dentro do funil**, em qualquer ponto do fluxo de blocos. Mantém os dois
mecanismos — não substitui o switch.

**Novo tipo de nó**: `follow_gate` — sem configuração nenhuma (usa os
mesmos textos fixos do gate de entrada), uma entrada e uma única saída
(igual ao bloco Mensagem, não ramifica). Como `instagram_funnel_nodes.type`
já é texto livre (sem enum no banco), não precisa de migração — só entra
na lista de tipos válidos em `instagram-funnel.ts` e ganha um cartão novo
no editor.

**Motor (`advanceFunnel`)**: ao chegar num nó `follow_gate`, já seguindo →
segue direto pra próxima aresta, sem mandar nada. Não seguindo → manda o
aviso (texto "primeira vez") e grava uma `instagram_funnel_sessions`
apontando pra esse nó (mesmo padrão de Condição/Botões) — pausa e espera.

**Resolução do clique em "Já segui"**: como agora existem *dois* lugares
onde alguém pode estar esperando (`instagram_follow_gates` pro gate de
entrada, `instagram_funnel_sessions` apontando pra um nó `follow_gate`
pro gate de funil), o handler do postback confere os dois, nessa ordem:
gate de entrada primeiro (mais comum), senão sessão de funil parada num
nó `follow_gate`. Confirmado que segue: apaga o estado pendente
correspondente e segue (mensagem da regra + funil, no caso de entrada;
só a aresta de saída do nó, no caso de bloco). Ainda não segue: reenvia o
aviso de repetição nos dois casos, sem limite de tentativas.

**Detalhe importante**: se a pessoa mandar uma mensagem de texto solta
(em vez de clicar no botão) enquanto está esperando num bloco `follow_gate`,
`processIncomingMessage` não deve apagar a sessão — só sessões paradas em
Condição/Botões são resolvidas por texto/quick_reply comum. A sessão do
gate só sai de pé pelo clique no postback.

## Adendo 2 — funil de comentário só avança depois de 1 resposta real (achado)

Testando um funil real (Gatilho → Botões "Quero PDF" → Mensagem com PDF)
ligado a uma regra de **comentário**, o bloco Botões nunca chegava —
só a mensagem da própria regra. Causa raiz, confirmada nos docs da Meta:
resposta privada a comentário (`sendPrivateReply`) só permite **uma
mensagem, ponto** — qualquer segunda mensagem automática (de qualquer
tipo de bloco) é rejeitada com `403 / code 10 / subcode 2534022`
("enviada fora do período permitido") até a pessoa responder alguma
coisa de volta. Isso vale só pra regra de **comentário** — resposta a
story já é uma DM de verdade da pessoa, então a janela de 24h já abre
normal e o funil encadeia sem esse problema.

**Descoberta que resolve**: a resposta privada aceita, na prática,
`quick_replies` no mesmo payload (a documentação oficial só mostra texto
puro, mas o ManyChat documenta exatamente esse comportamento: "a 1ª
resposta privada pode ter um único bloco de conteúdo — texto ou imagem,
com botões ou quick replies" — e assim que a pessoa clica, a janela
abre). Então: se o bloco ligado direto no Gatilho for **Botões**,
`processComment` funde as opções desse bloco na própria resposta privada
(mensagem da regra + botões, uma mensagem só) via
`sendPrivateReplyWithQuickReplies`, e grava a sessão esperando o clique
direto nesse nó — sem tentar mandar a mensagem do bloco Botões separada
(que ficaria sem uso nesse caso).

**Limitação que continua**: só Condição direto no Gatilho de uma regra
de comentário ainda esbarra na regra de 1 mensagem só (não tem texto
próprio pra mandar, então não dá pra fundir nada) — configuração rara,
não tratada.

## Adendo 5 — bloco Seguir como 1º bloco de regra de comentário (bug real)

Achado em produção: funil real (Gatilho → Seguir → Mensagem com PDF)
numa regra de **comentário** nunca mandava o aviso de seguir — caía
direto no texto antigo da regra (`rule.message`, um resquício de antes
da Fase 9.3) ou em "Oi! 👋", porque `processComment` só tinha fusão
pronta pra Botões e Mensagem — Seguir como 1º bloco não tinha
tratamento nenhum (documentado como limitação conhecida, mas na
prática batia direto no funil real de um cliente).

**Fix**: mesma técnica de fusão do Botões, mas com button template em
vez de quick_replies (`sendPrivateReplyWithButtonTemplate`, reaproveita
`buildFollowGateButtons` — extraído de `sendFollowGateMessage`). Se a
pessoa **já segue**, pula o bloco Seguir e resolve o próximo (mesma
ideia recursiva simples — só 1 nível, não persegue uma cadeia de
Seguir→Seguir). Se **não segue**, funde o aviso + botões na resposta
privada e grava a sessão esperando o clique — resolveFollowGate já
sabia lidar com essa sessão (mesmo mecanismo do bloco Seguir no meio do
funil), só faltava alguém criar ela nesse caso específico.

## Adendo 3 — regra não guarda mais mensagem própria, funil é obrigatório

Pedido do usuário: a regra não deveria ter campo de "Mensagem do DM"
separado — só escolher um funil, e o bloco Gatilho dele pra frente é
que define tudo (1ª mensagem inclusa).

**Mudança**: `instagram_funnel_rules.message` virou nullable (coluna
continua existindo só pra regra antiga, criada antes dessa mudança, sem
funil vinculado — grandfathered). Tela de criar regra não tem mais
campo de mensagem, só a escolha do funil (obrigatória — se a
organização não tiver nenhum funil ainda, pede pra criar um na aba
Funis primeiro). Tela de editar só mostra o campo de mensagem antiga se
a regra ainda não tiver funil.

**Motor**: `resolveFirstFunnelStep(funnelId)` acha o bloco ligado direto
no Gatilho. `processComment`/`processStoryReply`/`resolveEntryFollowGate`
usam esse 1º bloco como a "1ª mensagem":
- **Botões**: funde na resposta privada/DM (mesma técnica do Adendo 2).
- **Mensagem**: manda só o texto dela. Pra regra de **comentário**
  (restrição de 1 mensagem só), cria uma sessão-sentinela parada no
  próprio nó **Gatilho** — `processIncomingMessage` sabe reconhecer esse
  caso e, na próxima resposta de qualquer tipo da pessoa (janela de 24h
  já aberta a essa altura), reconstrói "1º bloco → aresta dele" e segue
  o funil a partir daí. Pra **resposta a story** (sem essa restrição) e
  pra **gate de seguir resolvido** (conversa já aberta), cascateia
  direto sem sentinela.
- **Condição/Seguir/Mensagem só com anexo (sem texto)** como 1º bloco:
  sem tratamento especial — cai no caminho antigo (`enterFunnelIfConfigured`),
  que pra regra de comentário provavelmente esbarra na mesma restrição
  de 1 mensagem (ver limitação acima).
