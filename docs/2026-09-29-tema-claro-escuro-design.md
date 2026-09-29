# DirectFlow — Fase 10: Tema claro/escuro/sistema

## Motivação

O design system (`src/styles.css`) já tinha as cores prontas pro modo
escuro (`:root` + `.dark`, Tailwind v4 via `@custom-variant dark`), mas
nada no app aplicava essa classe — só o canvas do editor de funil
(React Flow, `colorMode="system"`) seguia o SO, isolado do resto da
tela. Pedido: opção clara/escura (ou seguir o sistema) pra tela toda.

## Design

`src/lib/theme.tsx` — `ThemeProvider`/`useTheme()` (contexto React),
preferência salva em `localStorage` (`light` | `dark` | `system`).
Aplica/remove a classe `.dark` em `<html>`; no modo `system`, escuta
`prefers-color-scheme` pra acompanhar mudança em tempo real.

**Evita flash do tema errado**: como é SSR (TanStack Start), o servidor
não sabe a preferência salva no navegador. Um `<script>` inline em
`__root.tsx`, antes de `<HeadContent />`, roda síncrono antes da
hidratação e já aplica a classe certa — o React só sincroniza o estado
depois.

Seletor: três botões (Claro/Escuro/Sistema, ícones sol/lua/monitor) no
rodapé da barra lateral (`AppShell.tsx`), acima do "Sair" — visível em
toda tela logada.

O canvas do editor de funil (`colorMode` do React Flow) passou a seguir
a mesma escolha (`useTheme().theme`) em vez de sempre seguir o SO —
evita a tela toda clara com o canvas escuro (ou vice-versa) quando a
pessoa escolhe um tema diferente do sistema.

## Critério de pronto

- Build/typecheck sem erro.
- Escolher "Escuro" aplica o tema escuro na tela toda (não só o canvas
  do editor) e persiste depois de recarregar a página.
- Escolher "Sistema" acompanha `prefers-color-scheme` do SO, inclusive
  mudando em tempo real se o SO mudar com a aba aberta.
- Sem flash do tema errado ao carregar a página (script inline).
