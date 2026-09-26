# DirectFlow — Fase 8: Contatos (lista, tags, origem do lead)

## Motivação

A tela "Contatos" existe hoje só como placeholder "Em breve". Decisão do
brainstorming: em vez de criar uma tabela nova de "contato" duplicando
`instagram_conversations` (Fase 7), reaproveitar ela como fonte de
verdade — todo `igUserId` que já trocou pelo menos uma mensagem de Direct
(automação ou manual) é um contato. Isso cobre o mesmo público que já
aparece na Caixa de Entrada.

Escopo aprovado: lista unificada **+ tags com cor, múltiplas por contato
+ saber de onde veio o lead** (origem: comentário/palavra-chave, resposta
a story, ou mensagem direta orgânica).

## Schema

Duas colunas novas em `instagram_conversations` (nullable — conversas
antigas, de antes dessa fase, ficam sem essa informação, não tem como
reconstruir origem retroativamente):

```
source_type    text  -- "comment" | "story_reply" | "direct"
source_detail  text  -- snapshot da palavra-chave da regra que bateu (nullable)
```

Preenchido **só na criação** da conversa (nunca sobrescrito depois) —
mesmo princípio de "primeira origem é permanente" que já existe em
`instagram_funnel_leads` (snapshot de `comment_text`/`ig_username`, não
join ao vivo). Exceção: se a conversa foi criada pela mensagem de entrada
genérica (sem regra casada ainda) mas depois uma regra de story_reply bate
com a palavra-chave, `source_detail` é preenchido nesse momento via
`COALESCE` (só se ainda estiver nulo) — sem essa técnica, resposta a story
nunca teria o detalhe da palavra-chave, porque a mensagem de entrada é
logada antes da regra ser avaliada.

Duas tabelas novas:

```
instagram_tags
  id, organization_id, name, color (hex de paleta fixa), created_at
  UNIQUE(organization_id, name)

instagram_contact_tags
  id, conversation_id (FK cascade -> instagram_conversations),
  tag_id (FK cascade -> instagram_tags), created_at
  UNIQUE(conversation_id, tag_id)
```

## Server (`src/server/instagram-contacts.ts`, novo)

- `fetchContacts(tagId?)` — lista conversas da organização (mais recente
  primeiro), com array de tags anexado; filtro opcional por tag.
- `fetchTags()` — tags da organização.
- `createTag(name, color)` — color validada contra paleta fixa (8 cores).
- `deleteTag(tagId)` — cascade apaga as atribuições.
- `assignTag(igUserId, tagId)` / `removeTag(igUserId, tagId)` — toggle,
  ambos validam que a tag e a conversa pertencem à organização da sessão.

## Motor (`instagram-webhook.ts`)

`logMessage` ganha um 6º parâmetro opcional `source`. Três pontos passam
a informá-lo:
- Log genérico de entrada (`entry.messaging`, antes de saber se é resposta
  a story): `{ type: storyId ? "story_reply" : "direct" }`.
- `processComment`, depois do envio: `{ type: "comment", detail: rule.keyword }`.
- `processStoryReply`, depois do envio: `{ type: "story_reply", detail: rule.keyword }`.

## Tela (`admin.contatos.tsx`, reescrita)

Tabela: contato (username ou ID) · origem (badge: Comentário / Resposta a
story / Mensagem direta / — se não registrado) · última interação · tags
(badges coloridos + botão "+" com popover de checkboxes) · "Ver conversa"
(leva pra Caixa de Entrada já com aquela conversa aberta). Filtro por tag
no topo. Botão "Gerenciar tags" abre um diálogo simples de criar/apagar
tag com seletor de cor (paleta fixa, sem input de hex livre).

`admin.caixa-entrada.tsx` ganha suporte a `?ig=<id>` na URL (via
`validateSearch`) pra abrir direto naquela conversa quando vem do link
"Ver conversa".

## Critério de pronto

- Migração aplicada, build/typecheck sem erro.
- Comentário que dispara regra vira contato com origem "Comentário" e a
  palavra-chave certa.
- Resposta a story que dispara regra vira contato com origem "Resposta a
  story" e a palavra-chave certa (via COALESCE, mesmo indo pelo log de
  entrada genérico primeiro).
- Mensagem direta orgânica (sem regra) vira contato com origem "Mensagem
  direta".
- Criar/apagar tag, atribuir/remover tag de um contato, e filtrar a lista
  por tag funcionam de ponta a ponta.
- "Ver conversa" abre a Caixa de Entrada já na thread certa.
