# DirectFlow — Fase 7: Caixa de Entrada

## Motivação

Terceiro pedaço do plano "estrutura estilo ManyChat" (ver
`docs/2026-09-25-navegacao-lateral-manychat-design.md`) — depois da
navegação lateral e do gatilho de story, agora a Caixa de Entrada de
verdade: ver e responder manualmente as conversas do Instagram, sem
depender só da automação.

**Achado importante**: hoje o sistema não guarda histórico de conversa
nenhum — só cria um "lead" quando uma regra dispara (`instagram_funnel_leads`)
e uma "sessão" temporária enquanto espera resposta num bloco Condição/Botões
(`instagram_funnel_sessions`, apagada assim que a pessoa responde). Pra
existir uma Caixa de Entrada é preciso um armazenamento novo, do zero —
mensagem por mensagem, tenha disparado automação ou não.

**Decidido no brainstorming**: a Caixa de Entrada mostra só histórico de
Direct — comentário continua vivendo só na aba Leads (dentro de
Automação), não entra nessa tela. Resposta manual enviada por alguém do
time **pausa a automação** pra aquele contato (apaga qualquer sessão de
funil em andamento), pra não correr o risco do bot mandar mensagem em cima
de quem já está atendendo manualmente.

**Fora de escopo**: como a API de mensagens do Instagram só devolve o ID
numérico de quem manda DM (username só vem em evento de comentário), não
vamos fazer uma chamada extra à API só pra descobrir nome de usuário de
quem nunca comentou — mostra o ID cru nesse caso, mesmo comportamento que a
aba Leads já tem hoje.

## Schema

Duas tabelas novas:

```
instagram_conversations
  id, organization_id, ig_user_id, ig_username (nullable),
  last_message_at, last_message_preview, created_at
  UNIQUE(organization_id, ig_user_id)  -- mesmo padrão de instagram_funnel_sessions

instagram_messages
  id, conversation_id (FK cascade), direction ("in" | "out"),
  text, created_at
```

## `src/server/instagram-messages.ts` (novo)

- `logMessage(organizationId, igUserId, direction, text, igUsername?)` —
  helper interno: upsert em `instagram_conversations` (atualiza
  `last_message_at`/`last_message_preview`, e `ig_username` se vier
  preenchido) + insert em `instagram_messages`. Usado tanto pelo motor do
  webhook quanto pela própria Caixa de Entrada.
- `fetchConversations()` — lista as conversas da organização, ordenadas
  pela mais recente.
- `fetchConversationMessages(igUserId)` — histórico de uma conversa.
- `sendManualMessage(igUserId, text)` — manda a mensagem pela API (mesmo
  endpoint de mensagens já usado em `instagram-webhook.ts`), loga como
  saída, e **apaga** qualquer linha em `instagram_funnel_sessions` pra esse
  `(organizationId, igUserId)` antes de retornar — é isso que pausa a
  automação.

## Motor (`instagram-webhook.ts`)

Chama `logMessage` em todo ponto de entrada/saída de DM:
- Toda mensagem recebida em `entry.messaging` (antes de decidir se é
  resposta a story, continuação de sessão, ou nenhum dos dois) — loga como
  entrada, sempre, independente de disparar algo.
- Toda mensagem que o motor manda: resposta de regra
  (`sendPrivateReply`/`sendDirectMessage` em `processComment` e
  `processStoryReply`), e cada mensagem dentro do funil (`sendDirectMessage`,
  `sendDirectMessageWithQuickReplies`, `sendFileMessage` — anexo loga como
  `"[arquivo: nome]"`) — loga como saída.

Comentário (webhook `changes`, campo `comments`) **não** gera entrada em
`instagram_messages` — só a mensagem privada que ele dispara.

## Tela (`admin.caixa-entrada.tsx`)

Layout de inbox: lista de conversas à esquerda (mais recente primeiro,
prévia da última mensagem, `@username` ou ID cru), thread de mensagens à
direita (bolhas alinhadas por direção) com campo de texto + enviar no
rodapé. Sem infra de tempo real — atualiza via polling (`refetchInterval`
do react-query, a cada poucos segundos) na conversa aberta e na lista.

## Critério de pronto

- Migração aplicada, `npm run build`/`tsc --noEmit` sem erro.
- Mensagem recebida de verdade (via webhook) aparece na Caixa de Entrada
  sem precisar disparar nenhuma regra.
- Mensagem enviada pela automação (regra ou bloco do funil) aparece na
  mesma thread, do lado certo.
- Responder manualmente por essa tela envia a mensagem de verdade pro
  Instagram e apaga a sessão de funil em andamento daquele contato, se
  houver.
