# DirectFlow — Fase 6: gatilho "Resposta ao story"

## Motivação

Hoje toda regra do funil dispara por **comentário num post específico**. O
ManyChat também oferece "Resposta ao story" como gatilho (confirmado com a
Meta: quando alguém responde a um story, o webhook de mensagem chega com
`message.reply_to.story = { id, url }`, diferente de resposta a mensagem
normal, que traz `reply_to.mid`). Esta fase adiciona esse segundo tipo de
gatilho, mantendo comentário-no-post como está.

Diferença importante de story pra post: story expira em 24h, então a regra
**não** trava num story específico — dispara em resposta a **qualquer**
story da conta conectada que contenha a palavra-chave, igual à lógica de
"contém a palavra" já usada pra comentário.

## Schema

Em `instagram_funnel_rules`:
- `trigger_type` (novo, `text`, `NOT NULL DEFAULT 'comment'`, valores
  `"comment" | "story_reply"`) — regras existentes continuam `"comment"`
  automaticamente.
- `post_id` deixa de ser `NOT NULL` — só faz sentido pra `trigger_type =
  "comment"`.
- `public_reply` continua existindo mas não se aplica a `story_reply` (não
  existe resposta pública em story) — fica sempre `null` nesse tipo,
  reforçado na validação do servidor.

## Motor (`instagram-webhook.ts`)

Nova função `processStoryReply(igBusinessAccountId, { mid, text, fromId })`,
paralela à `processComment`: busca a conexão, busca regras do organização
com `trigger_type = "story_reply"` e `active = true`, casa por palavra-chave
(mesmo `matchByKeyword` já usado), manda a mensagem da regra via
`sendDirectMessage` (recipient pelo `fromId`, igual DM comum — sem
"resposta pública", sem `comment_id`), e registra em `instagram_funnel_leads`
reaproveitando a coluna `comment_id` pra guardar o `mid` da mensagem (mesma
proteção de dedup contra reentrega da Meta). Segue pro funil vinculado
igual `processComment` já faz.

`handleInstagramWebhook`: no loop de `entry.messaging`, extrai
`event.message?.reply_to?.story`. Se presente, chama `processStoryReply` (e
conta pro `leadsCreated`) — **não** passa por `processIncomingMessage`
(resposta a story é sempre gatilho novo, nunca continuação de sessão
pausada, mesma separação que já existe entre comentário e DM comum hoje).
Sem `reply_to.story`, comportamento inalterado.

`MessagingEvent` ganha `mid` e `reply_to?.story?.id`.

## Editor de regra (`admin.instagram-funil.tsx`)

No diálogo de nova regra, campo novo no topo: escolha entre **"Comentário
no post"** (fluxo atual, com o seletor de posts) e **"Resposta ao story"**
(sem seletor de post). Campo "Resposta pública" só aparece pra
`"comment"`. Na lista de regras, uma regra `story_reply` mostra um ícone
genérico de story no lugar da miniatura do post (não tem post fixo) e uma
badge indicando o tipo.

Edição de regra existente: tipo de gatilho não muda depois de criada (seguir
o mesmo padrão já existente de "post fica fixo, pra trocar é mais simples
excluir e criar de novo").

## Critério de pronto

- Migração aplicada (coluna nova + `post_id` opcional) sem quebrar regras
  existentes (todas continuam `trigger_type = "comment"`).
- `npm run build` e `tsc --noEmit` sem erro.
- Criar uma regra "Resposta ao story" salva sem exigir post.
- Teste manual (depende de conta real conectada): responder a um story da
  conta conectada com a palavra-chave dispara a mensagem configurada.
