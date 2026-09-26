# DirectFlow — Fase 5: navegação lateral estilo ManyChat

## Motivação

O usuário pediu explicitamente pra o DirectFlow adotar a mesma estrutura
visual/navegação do ManyChat, mostrando capturas de tela do produto real:
barra lateral fixa (Início, Contatos, Automação, Manychat AI, Caixa de
Entrada, Configurações), com um construtor de automação em formato de
assistente (mais simples que o Flow Builder avançado deles, que é o
equivalente ao nosso editor visual atual) e uma Caixa de Entrada separada
pra responder conversas manualmente.

O pedido foi quebrado em 5 pedaços independentes no brainstorming (navegação,
construtor em wizard, insights/analytics, caixa de entrada, contatos). Esta
fase cobre só o primeiro: **a navegação em si** — reorganizar o app pra ter
a mesma estrutura de seções do ManyChat, com placeholders honestos ("Em
breve") nas seções que ainda não têm funcionalidade real por trás. As
próximas 4 fases (wizard, insights, inbox de verdade, contatos de verdade)
ficam pra specs futuros, cada uma preenchendo um desses placeholders.

**Deixado de fora deliberadamente**: o item "Manychat AI" da barra deles —
não existe (nem está planejado) um assistente de IA como produto no
DirectFlow, incluir o item sem nada por trás seria enganoso.

## Estrutura da barra lateral

Cinco itens, ícone + rótulo, item ativo destacado visualmente:

1. **Início** (`/admin/inicio`) — nova. Não fica em branco: mostra
   saudação, status da conexão do Instagram (reaproveita
   `fetchInstagramConnection`, mesmo componente visual já usado na tela de
   conexão) e atalhos pras seções que já funcionam de verdade (Automação,
   Configurações).
2. **Contatos** (`/admin/contatos`) — nova, placeholder "Em breve".
3. **Automação** (`/admin/instagram-funil` — rota existente, só o rótulo
   na navegação muda) — lista de Regras/Funis + editor visual, sem
   mudança de comportamento nesta fase.
4. **Caixa de Entrada** (`/admin/caixa-entrada`) — nova, placeholder "Em
   breve".
5. **Configurações** (`/admin/configuracoes` — rota existente) — ganha
   abas (componente `Tabs` já usado em outro lugar do projeto):
   - Aba "OpenAI": o que já existe hoje (campo da chave).
   - Aba "Conexão Instagram": o conteúdo que hoje vive em
     `/admin/instagram-conexao` (botão Conectar/Desconectar, status,
     expiração do token) — migra pra cá. É o mesmo padrão do ManyChat,
     que também guarda conexão de canal dentro de Configurações, não como
     item de primeiro nível.

`/admin/instagram-conexao` continua existindo como rota, mas vira um
redirect puro pra `/admin/configuracoes` (evita link quebrado pra quem já
tinha essa URL salva/em favoritos).

`/` (raiz) passa a redirecionar pra `/admin/inicio` em vez de direto pro
funil — mantém o padrão de "raiz sempre redireciona", só muda o destino.

## AppShell

Troca de header horizontal (o que existe hoje) pra barra lateral fixa à
esquerda, largura fixa, sem colapsar por enquanto (YAGNI — adiciona depois
se fizer falta). Botão "Sair" no rodapé da barra, não mais no canto do
header.

## Placeholders "Em breve" (Contatos, Caixa de Entrada)

Mesmo componente reaproveitado nos dois: ícone grande, título da seção,
uma frase curta do que vai fazer quando existir (não é tela em branco nem
erro — é claramente "planejado, ainda não construído").

## Critério de pronto

- `npm run build` e `tsc --noEmit` sem erro.
- Navegação lateral aparece em todas as páginas administrativas, com o
  item ativo destacado corretamente em cada rota.
- Aba "Conexão Instagram" dentro de Configurações funciona exatamente como
  a tela antiga (conectar, desconectar, ver status) — sem regressão.
- `/admin/instagram-conexao` redireciona sem piscar erro 404.
- Contatos e Caixa de Entrada renderizam o placeholder, não erro nem tela
  vazia.
