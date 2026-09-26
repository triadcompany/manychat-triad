import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmBreve } from "@/components/EmBreve";

export const Route = createFileRoute("/admin/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Admin" }] }),
  component: ContatosPage,
});

function ContatosPage() {
  return (
    <AppShell>
      <EmBreve
        icon={Users}
        title="Contatos"
        description="Lista de todo mundo que já interagiu com o seu Instagram pelo funil, com tags e segmentação."
      />
    </AppShell>
  );
}
