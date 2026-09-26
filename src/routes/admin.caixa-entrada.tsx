import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { fetchConversations, fetchConversationMessages, sendManualMessage } from "@/server/instagram-messages";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/caixa-entrada")({
  head: () => ({ meta: [{ title: "Caixa de Entrada — Admin" }] }),
  component: CaixaEntradaPage,
});

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CaixaEntradaPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ["instagram-conversations"],
    queryFn: fetchConversations,
    refetchInterval: 5000,
  });

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)]">
        <aside className="w-72 shrink-0 border-r border-border overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-16 px-4">
              <MessageCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa ainda.</p>
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.ig_user_id}
                onClick={() => setSelected(c.ig_user_id)}
                className={cn(
                  "w-full text-left px-4 py-3 border-b border-border transition-colors",
                  selected === c.ig_user_id ? "bg-accent" : "hover:bg-muted"
                )}
              >
                <p className="text-sm font-medium truncate">{c.ig_username ? `@${c.ig_username}` : c.ig_user_id}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message_preview}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatTime(c.last_message_at)}</p>
              </button>
            ))
          )}
        </aside>

        <div className="flex-1 min-w-0">
          {selected ? (
            <ConversationThread igUserId={selected} />
          ) : (
            <div className="h-full flex items-center justify-center text-center px-4">
              <div>
                <MessageCircle className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Escolha uma conversa pra ver as mensagens.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ConversationThread({ igUserId }: { igUserId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["instagram-conversation-messages", igUserId],
    queryFn: () => fetchConversationMessages(igUserId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: () => sendManualMessage(igUserId, text.trim()),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["instagram-conversation-messages", igUserId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao enviar mensagem"),
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[70%] rounded-xl px-3 py-2 text-sm",
                m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
              )}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              <p className={cn("text-[10px] mt-1", m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                {formatTime(m.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="min-h-[44px] max-h-32 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !sendMutation.isPending) sendMutation.mutate();
            }
          }}
        />
        <Button size="icon" onClick={() => sendMutation.mutate()} disabled={!text.trim() || sendMutation.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
