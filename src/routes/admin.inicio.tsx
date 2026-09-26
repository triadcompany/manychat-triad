import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Instagram, Zap, Settings } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { fetchInstagramConnection } from "@/server/instagram-funnel";

export const Route = createFileRoute("/admin/inicio")({
  head: () => ({ meta: [{ title: "Início — Admin" }] }),
  component: InicioPage,
});

function InicioPage() {
  const { data: connection, isLoading } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: fetchInstagramConnection,
  });

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Bem-vindo(a) ao DirectFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Funil de vendas via Instagram — comentário no post vira mensagem direta automática.
          </p>
        </div>

        <Card className="p-5 flex items-center gap-4">
          <Instagram className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Verificando conexão...</p>
            ) : connection ? (
              <p className="text-sm font-medium text-status-on-target">Instagram conectado</p>
            ) : (
              <>
                <p className="text-sm font-medium text-destructive">Instagram não conectado</p>
                <p className="text-xs text-muted-foreground mt-0.5">O funil não funciona sem isso.</p>
              </>
            )}
          </div>
          {!isLoading && !connection && (
            <Link
              to="/admin/configuracoes"
              className="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline shrink-0"
            >
              Conectar
            </Link>
          )}
        </Card>

        <div className="grid sm:grid-cols-2 gap-3">
          <Link to="/admin/instagram-funil" className="block">
            <Card className="p-5 hover:border-primary/50 transition-colors h-full">
              <Zap className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Automação</p>
              <p className="text-xs text-muted-foreground mt-0.5">Regras, funis e o editor visual do fluxo.</p>
            </Card>
          </Link>
          <Link to="/admin/configuracoes" className="block">
            <Card className="p-5 hover:border-primary/50 transition-colors h-full">
              <Settings className="h-5 w-5 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Configurações</p>
              <p className="text-xs text-muted-foreground mt-0.5">Conexão do Instagram e chave da OpenAI.</p>
            </Card>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
