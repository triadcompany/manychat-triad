# DirectFlow — Fase 9.4: Testar funil sem precisar de ação real

## Motivação

Até aqui, validar um funil exigia comentar/responder um story de verdade
no Instagram — lento pra iterar, principalmente depois de descobrir as
restrições de janela de mensagem da Meta (Adendo 2/3 do gate de seguir).
Pedido: testar direto na plataforma.

## Design

Botão "Testar funil" no editor → escolhe um contato dentre as conversas
já existentes na Caixa de Entrada (precisa de uma conversa aberta de
verdade — é o único jeito de mandar mensagem sem passar pela resposta
privada a comentário, que exige um comentário real) → manda o funil a
partir do bloco ligado ao Gatilho, usando a mesma engine de produção
(`advanceFunnel`, `sendDirectMessage`, `sendDirectMessageWithQuickReplies`
etc. — nunca a resposta privada, que não existe fora de um comentário
real).

**Sem conversa nenhuma ainda**: a tela avisa que precisa de um contato
com Direct aberto — a saída é a pessoa mandar um Direct qualquer pra
própria conta primeiro (mesmo bootstrap que a Caixa de Entrada já usa).

## Schema

```
instagram_funnel_leads
  rule_id agora nullable — lead de teste não tem regra por trás
  + is_test boolean not null default false
```

`fetchFunnelLeads` já faz `innerJoin` com `instagram_funnel_rules` — lead
de teste (rule_id nulo) já fica de fora da aba Leads automaticamente,
sem precisar de filtro novo.

## Server

`runFunnelTest(organizationId, igUserId, funnelId)` em
`instagram-webhook.ts` (`createServerOnlyFn`, mesmo motivo de
`logMessage`): acha o 1º bloco do funil, cria um lead marcado
`is_test: true`, manda o bloco (Botões funde quick_replies, Mensagem
manda o texto e segue por `advanceFunnel`, resto cai direto em
`advanceFunnel`). Exposto via `testFunnel(funnelId, igUserId)` em
`instagram-funnel.ts`.

## Critério de pronto

- Migração aplicada, build/typecheck sem erro.
- "Testar funil" com pelo menos uma conversa existente manda a mensagem
  de verdade pro contato escolhido.
- Lead de teste não aparece na aba Leads.
- Clique nos botões do teste continua o funil normalmente (mesma engine
  de produção).
