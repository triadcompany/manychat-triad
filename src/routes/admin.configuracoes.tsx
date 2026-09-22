import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { fetchOpenAiKeyStatus, setOpenAiKey, clearOpenAiKey } from "@/server/settings";

export const Route = createFileRoute("/admin/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Admin" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
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
    <AppShell>
      <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Configurações</h1>
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <p className="text-sm font-medium">API Key do Agente (OpenAI)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Usada pelos blocos de Condição do funil pra classificar a resposta do lead por
              intenção, em vez de só casar palavra-chave literal. Sem chave configurada, o funil
              continua funcionando só com o casamento literal.
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
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!value.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            {data?.configured && (
              <Button
                variant="outline"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
              >
                Remover chave
              </Button>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
