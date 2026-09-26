import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Instagram } from "lucide-react";
import { toast } from "sonner";
import { fetchOpenAiKeyStatus, setOpenAiKey, clearOpenAiKey } from "@/server/settings";
import { fetchInstagramConnection, disconnectInstagram } from "@/server/instagram-funnel";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  return (
    <AppShell>
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Configurações</h1>
        </div>

        <Tabs defaultValue="conexao">
          <TabsList>
            <TabsTrigger value="conexao">Conexão Instagram</TabsTrigger>
            <TabsTrigger value="openai">OpenAI</TabsTrigger>
          </TabsList>
          <TabsContent value="conexao">
            <ConexaoInstagramTab />
          </TabsContent>
          <TabsContent value="openai">
            <OpenAiTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const ERROR_MESSAGES: Record<string, string> = {
  cancelado: "Conexão cancelada.",
  state_invalido: "Não foi possível confirmar a autorização — tente conectar de novo.",
  falha_conexao: "Falha ao conectar com o Instagram — tente de novo em instantes.",
};

function ConexaoInstagramTab() {
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
    <div className="space-y-4">
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
            <Button variant="outline" onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
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
          Ao clicar em "Conectar Instagram" você é levado pro Instagram, autoriza o acesso pra este
          sistema enviar mensagens em nome da sua conta, e volta já conectado — sem precisar gerar
          nem colar nenhum token à mão.
        </p>
      </Card>
    </div>
  );
}

function OpenAiTab() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["openai-key-status"],
    queryFn: fetchOpenAiKeyStatus,
  });

  const saveMutation = useMutation({
    mutationFn: () => setOpenAiKey({ data: { value: value.trim() } }),
    onSuccess: () => {
      toast.success("Chave da OpenAI salva.");
      setValue("");
      queryClient.invalidateQueries({ queryKey: ["openai-key-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar a chave"),
  });

  const clearMutation = useMutation({
    mutationFn: () => clearOpenAiKey(),
    onSuccess: () => {
      toast.success("Chave removida — o funil volta a casar só por palavra-chave.");
      queryClient.invalidateQueries({ queryKey: ["openai-key-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao remover a chave"),
  });

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-sm font-medium">API Key do Agente (OpenAI)</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Usada pelos blocos de Condição do funil pra classificar a resposta do lead por intenção, em
          vez de só casar palavra-chave literal. Sem chave configurada, o funil continua funcionando
          só com o casamento literal.
        </p>
      </div>

      {!isLoading && (
        <p className={`text-sm font-medium ${data?.configured ? "text-status-on-target" : "text-muted-foreground"}`}>
          {data?.configured ? "Configurada" : "Não configurada"}
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="openai-key">{data?.configured ? "Atualizar chave" : "Chave da API"}</Label>
        <Input
          id="openai-key"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-..."
          className="font-mono text-xs"
          spellCheck={false}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => saveMutation.mutate()} disabled={!value.trim() || saveMutation.isPending}>
          {saveMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
        {data?.configured && (
          <Button variant="outline" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
            Remover chave
          </Button>
        )}
      </div>
    </Card>
  );
}
