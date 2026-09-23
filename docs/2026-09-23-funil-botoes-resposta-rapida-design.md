# manychat-triad como SaaS — Fase 4: bloco "Botões" (quick replies) no funil

## Motivação

Depois das Fases 1–3 (scaffolding, cadastro self-service, conexão via OAuth
— ver os specs anteriores em `docs/`), o próximo investimento é evoluir o
editor de funil pra mais perto do que ferramentas como ManyChat oferecem.
Esta fase decompõe essa ambição maior num primeiro incremento contido: **o
lead responder tocando num botão em vez de digitar**.

Hoje o único jeito de ramificar uma conversa é o bloco **Condição**, que
espera texto livre e casa por palavra-chave (ou IA). Funciona, mas depende
da pessoa digitar algo parecido o suficiente. A API de mensagens do
Instagram suporta *quick replies* — botões junto da mensagem — que eliminam
essa ambiguidade: o clique manda de volta um `payload` exato.

Formato confirmado na documentação oficial da Meta: até **13 botões** por
mensagem, cada título com até **20 caracteres** (truncado depois disso). O
clique chega no webhook como `message.quick_reply.payload`.

**Decisão do brainstorming**: em vez de estender o bloco Condição
existente, este é um **bloco novo e separado** — "Botões" (`type:
"quick_reply"`) — com um papel mais estreito e específico: só casa clique
exato, nunca tenta interpretar texto livre (isso continua sendo só do
Condição). Os dois blocos convivem: quem quiser continuar com
palavra-chave/IA usa Condição; quem quiser botões usa este novo bloco.

## Schema

Duas colunas novas em `instagram_funnel_nodes`:

- `quick_reply_options` (`jsonb`, default `[]`) — array de `{ id: string,
  label: string }`, uma entrada por botão. Mesma forma de
  `condition_keywords`, mas coluna própria — são conceitos de blocos
  diferentes, mesmo que a forma dos dados seja parecida.

A **mensagem** do bloco (o texto que sai junto com os botões) reaproveita a
coluna `message` já existente — hoje só usada pelo bloco Mensagem, mas
semanticamente é a mesma coisa: "texto que esse bloco manda quando a
execução chega nele". Sem coluna nova pra isso.

`type` na tabela já é `text` sem `CHECK` constraint — `"quick_reply"` é só
mais um valor possível, não precisa de migração de enum, só as duas colunas
novas.

## Motor (`instagram-webhook.ts`)

**`advanceFunnel`** — novo branch pro `node.type === "quick_reply"`:

1. Envia a mensagem do nó com `quick_replies` anexado — um por entrada de
   `quick_reply_options`, `title` = `label` (truncado a 20 caracteres,
   defensivo mesmo com validação no editor), `payload` = `id`. No máximo os
   13 primeiros, mesmo raciocínio defensivo.
2. Grava/atualiza `instagram_funnel_sessions` com `currentNodeId` = este nó
   (mesmo padrão que Condição já usa hoje via `onConflictDoUpdate` por
   `(organizationId, igUserId)`).
3. Para — não segue pro próximo bloco sozinho, espera a resposta.

Nova função `sendDirectMessageWithQuickReplies` (ao lado de
`sendDirectMessage` já existente), mesmo formato de chamada
(`POST {BASE_URL}/{igBusinessAccountId}/messages`), corpo com
`message.quick_replies` além de `message.text`.

**`processIncomingMessage`** — hoje só aceita sessão parada num nó
`condition` (`if (!node || node.type !== "condition") return;`). Passa a
aceitar `quick_reply` também:

- Extrai `message.quick_reply?.payload` do evento recebido (novo campo em
  `MessagingEvent`), além do `text` que já era extraído.
- Se o nó atual é `condition`: comportamento inalterado (casamento por
  palavra-chave ou IA, como hoje).
- Se o nó atual é `quick_reply`: se veio `quick_reply.payload`, casa direto
  contra o `id` de alguma entrada de `quick_reply_options` (comparação
  exata) — achou, usa esse `id` como `sourceHandle`; não achou (não deveria
  acontecer, mas defensivo) cai em `"default"`. Sem `quick_reply.payload`
  (a pessoa digitou em vez de tocar), cai direto em `"default"` também —
  **sem** tentar casar o texto contra os rótulos dos botões, de propósito:
  esse bloco não faz interpretação de texto, só reage a clique.
- Resto do fluxo (buscar a aresta pelo handle, `advanceFunnel` a partir do
  alvo) inalterado.

## Server functions (`instagram-funnel.ts`)

`FunnelNodeRow`, `saveGraphSchema` e os mapeamentos em `fetchFunnelGraph`/
`saveFunnelGraph` ganham `quick_reply_options: { id: string; label: string
}[]` (mesmo padrão de `condition_keywords` hoje) e `"quick_reply"` entra no
union/enum de `type` ao lado de `"trigger" | "message" | "condition"`.

## Editor (`admin.instagram-funil-editor.$funnelId.tsx`)

- Botão novo **"Botões"** na barra de ferramentas, ao lado de "Mensagem" e
  "Condição".
- `QuickReplyNodeCard` — card visual próprio (cor distinta das outras três,
  ex: roxo), mostra preview da mensagem e a lista de rótulos dos botões.
- `QuickReplyNodeEditor` (diálogo) — campo de mensagem (obrigatório — a API
  da Meta não aceita `quick_replies` sem texto acompanhando) + lista de
  opções (rótulo com contador de caracteres, aviso ao passar de 20; botão
  "Adicionar opção" desabilitado ao chegar em 13). Mesma saída fixa
  "Ignorou/digitou" sempre visível, igual ao "Nenhuma bateu" do Condição.

## Critério de pronto

- `npm run build` e `tsc --noEmit` sem erro.
- Editor: criar um bloco Botões, configurar mensagem + 2-3 opções, conectar
  as saídas (incluindo "Ignorou/digitou"), salvar e recarregar — o funil
  volta exatamente como foi salvo.
- Validação do editor: não deixa passar de 13 opções; avisa (não bloqueia
  silenciosamente) rótulo acima de 20 caracteres.
- Teste manual end-to-end (precisa de conexão Instagram real, ver Fase 3):
  tocar num botão leva pro bloco certo; digitar em vez de tocar cai em
  "Ignorou/digitou".
