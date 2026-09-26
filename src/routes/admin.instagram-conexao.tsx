import { createFileRoute, redirect } from "@tanstack/react-router";

// Conexão do Instagram virou uma aba dentro de Configurações — mantém a
// URL antiga funcionando (não quebra link salvo) só como redirect.
export const Route = createFileRoute("/admin/instagram-conexao")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/configuracoes" });
  },
});
