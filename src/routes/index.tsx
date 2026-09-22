import { createFileRoute, redirect } from "@tanstack/react-router";

// Ainda não existe dashboard neste produto — a única coisa que faz sentido
// logo após o login é a tela do funil.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/instagram-funil" });
  },
});
