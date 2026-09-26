import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmBreve } from "@/components/EmBreve";

export const Route = createFileRoute("/admin/caixa-entrada")({
  head: () => ({ meta: [{ title: "Caixa de Entrada — Admin" }] }),
  component: CaixaEntradaPage,
});

function CaixaEntradaPage() {
  return (
    <AppShell>
      <EmBreve
        icon={MessageCircle}
        title="Caixa de Entrada"
        description="Veja e responda manualmente as conversas do Instagram, sem depender só da automação."
      />
    </AppShell>
  );
}
