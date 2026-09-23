import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Instagram } from "lucide-react";
import { toast } from "sonner";
import { fetchInstagramConnection, disconnectInstagram } from "@/server/instagram-funnel";

export const Route = createFileRoute("/admin/instagram-conexao")({
  head: () => ({ meta: [{ title: "Conexão Instagram — Admin" }] }),
  component: InstagramConexaoPage,
});

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const ERROR_MESSAGES: Record<string, string> = {
  cancelado: "Conexão cancelada.",
  state_invalido: "Não foi possível confirmar a autorização — tente conectar de novo.",
  falha_conexao: "Falha ao conectar com o Instagram — tente de novo em instantes.",
};

function InstagramConexaoPage() {
  const queryClient = useQueryClient();

  const { data: connection, isLoading } = useQuery({
    queryKey: ["instagram-connection"],
    queryFn: fetchInstagramConnection,
  });

  // /api/instagram/callback redireciona pra cá com ?connected=1 ou
  // ?error=... — mostra o toast uma vez e limpa a query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const connected = params.get("connected");
    if (connected) {
      toast.success("Instagram conectado.");
      queryClient.invalidateQueries({ queryKey: ["instagram-connection"] });
    } else if (error) {
      toast.error(ERROR_MESSAGES[error] ?? "Erro ao conectar o Instagram.");
    }
    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnectMutation = useMutation({
    mutationFn: disconnectInstagram,
    onSuccess: () => {
      toast.success("Instagram desconectado.");
      queryClient.invalidateQueries({ queryKey: ["instagram-connection"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao desconectar"),
  });

  const expiringSoon = connection?.expires_at && daysUntil(connection.expires_at) <= 7;

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Instagram className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Conexão Instagram</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Usada pelo{" "}
          <Link to="/admin/instagram-funil" className="underline underline-offset-2 hover:text-foreground">
            funil de comentário → DM
          </Link>
          .
        </p>

        <Card className="overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4 border-b border-border bg-muted/10">
            <Instagram className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Verificando...</p>
              ) : connection ? (
                <>
                  <p className={`text-sm font-medium ${expiringSoon ? "text-status-attention" : "text-status-on-target"}`}>
                    {expiringSoon ? "Conectado — token expira em breve" : "Conectado"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{connection.instagram_business_account_id}</p>
                  {connection.expires_at && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Token expira em {new Date(connection.expires_at).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-destructive">Não conectado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">O funil não vai funcionar sem isso.</p>
                </>
              )}
            </div>
          </div>

          <div className="p-5">
            {connection ? (
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? "Desconectando..." : "Desconectar"}
              </Button>
            ) : (
              <Button asChild disabled={isLoading}>
                <a href="/api/instagram/connect">Conectar Instagram</a>
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-sm text-muted-foreground">
            Ao clicar em "Conectar Instagram" você é levado pro Instagram, autoriza o acesso pra
            este sistema enviar mensagens em nome da sua conta, e volta já conectado — sem
            precisar gerar nem colar nenhum token à mão.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
