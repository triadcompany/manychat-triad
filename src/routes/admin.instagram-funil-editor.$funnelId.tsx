import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Zap, MessageSquare, GitBranch, Plus, X, Save, Paperclip, Sparkles, MousePointerClick, UserPlus, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { fetchFunnelGraph, saveFunnelGraph, fetchFunnels, testFunnel } from "@/server/instagram-funnel";
import { fetchConversations } from "@/server/instagram-messages";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/admin/instagram-funil-editor/$funnelId")({
  head: () => ({ meta: [{ title: "Editor de Funil — Admin" }] }),
  component: FunnelEditorPage,
});

interface MessageData extends Record<string, unknown> {
  message: string;
  file_base64: string | null;
  file_mimetype: string | null;
  file_filename: string | null;
}
interface ConditionData extends Record<string, unknown> {
  keywords: { id: string; keyword: string }[];
  use_ai: boolean;
}
interface QuickReplyData extends Record<string, unknown> {
  message: string;
  options: { id: string; label: string }[];
}
interface FollowGateData extends Record<string, unknown> {
  message: string;
  retry_message: string;
  confirm_label: string;
  profile_label: string;
}

function TriggerNodeCard() {
  return (
    <div className="rounded-xl border-2 border-amber-500/60 bg-amber-500/10 px-4 py-3 min-w-[180px] shadow-sm">
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-[10px] uppercase tracking-wide">
        <Zap className="h-3.5 w-3.5" /> Gatilho
      </div>
      <p className="text-sm font-medium mt-1">Lead capturado</p>
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-3 !h-3" />
    </div>
  );
}

function MessageNodeCard({ data }: NodeProps<Node<MessageData>>) {
  return (
    <div className="rounded-xl border-2 border-border bg-card px-4 py-3 min-w-[200px] max-w-[240px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-3 !h-3" />
      <div className="flex items-center gap-1.5 text-muted-foreground font-semibold text-[10px] uppercase tracking-wide">
        <MessageSquare className="h-3.5 w-3.5" /> Enviar mensagem
      </div>
      {data.file_filename ? (
        <p className="text-sm mt-1 flex items-center gap-1.5 text-foreground/90">
          <Paperclip className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{data.file_filename}</span>
        </p>
      ) : (
        <p className="text-sm mt-1 line-clamp-3 whitespace-pre-wrap">{data.message || "Clique 2x pra escrever a mensagem..."}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-primary !w-3 !h-3" />
    </div>
  );
}

function ConditionNodeCard({ data }: NodeProps<Node<ConditionData>>) {
  const rows = [...data.keywords, { id: "default", keyword: "Nenhuma bateu" }];
  return (
    <div className="rounded-xl border-2 border-sky-500/60 bg-sky-500/10 px-4 py-3 min-w-[220px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-3 !h-3" />
      <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-semibold text-[10px] uppercase tracking-wide">
        <GitBranch className="h-3.5 w-3.5" /> Condição
        {data.use_ai && <Sparkles className="h-3 w-3" aria-label="Classificado por IA" />}
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="relative flex items-center bg-background/70 rounded px-2 py-1 pr-4">
            <span className={`text-xs truncate ${r.id === "default" ? "text-muted-foreground italic" : "font-mono"}`}>{r.keyword}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={r.id}
              style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)" }}
              className="!bg-sky-500 !w-3 !h-3"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickReplyNodeCard({ data }: NodeProps<Node<QuickReplyData>>) {
  const rows = [...data.options, { id: "default", label: "Ignorou/digitou" }];
  return (
    <div className="rounded-xl border-2 border-violet-500/60 bg-violet-500/10 px-4 py-3 min-w-[220px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-3 !h-3" />
      <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 font-semibold text-[10px] uppercase tracking-wide">
        <MousePointerClick className="h-3.5 w-3.5" /> Botões
      </div>
      <p className="text-sm mt-1 line-clamp-2 whitespace-pre-wrap">{data.message || "Clique 2x pra escrever a mensagem..."}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="relative flex items-center bg-background/70 rounded px-2 py-1 pr-4">
            <span className={`text-xs truncate ${r.id === "default" ? "text-muted-foreground italic" : ""}`}>{r.label}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={r.id}
              style={{ position: "absolute", right: -18, top: "50%", transform: "translateY(-50%)" }}
              className="!bg-violet-500 !w-3 !h-3"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowGateNodeCard({ data }: NodeProps<Node<FollowGateData>>) {
  return (
    <div className="rounded-xl border-2 border-rose-500/60 bg-rose-500/10 px-4 py-3 min-w-[200px] max-w-[260px] shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-3 !h-3" />
      <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-[10px] uppercase tracking-wide">
        <UserPlus className="h-3.5 w-3.5" /> Seguir
      </div>
      <p className="text-sm mt-1 line-clamp-3 whitespace-pre-wrap">
        {data.message || 'Falta só um passo: me segue aqui no perfil 👀 (texto padrão, clique 2x pra mudar)'}
      </p>
      <Handle type="source" position={Position.Right} className="!bg-rose-500 !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNodeCard,
  message: MessageNodeCard,
  condition: ConditionNodeCard,
  quick_reply: QuickReplyNodeCard,
  follow_gate: FollowGateNodeCard,
};

function FunnelEditorPage() {
  const { funnelId } = useParams({ from: "/admin/instagram-funil-editor/$funnelId" });
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loaded, setLoaded] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const { data: funnels = [] } = useQuery({ queryKey: ["instagram-funnels"], queryFn: fetchFunnels });
  const funnelName = funnels.find((f) => f.id === funnelId)?.name ?? "Funil";

  const { data: graph } = useQuery({ queryKey: ["instagram-funnel-graph", funnelId], queryFn: () => fetchFunnelGraph(funnelId) });

  useEffect(() => {
    if (!graph || loaded) return;
    setNodes(
      graph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: { x: n.position_x, y: n.position_y },
        deletable: n.type !== "trigger",
        data:
          n.type === "message"
            ? { message: n.message ?? "", file_base64: n.file_base64, file_mimetype: n.file_mimetype, file_filename: n.file_filename }
            : n.type === "condition"
              ? { keywords: n.condition_keywords, use_ai: n.condition_use_ai }
              : n.type === "quick_reply"
                ? { message: n.message ?? "", options: n.quick_reply_options }
                : n.type === "follow_gate"
                  ? {
                      message: n.message ?? "",
                      retry_message: n.follow_gate_retry_message ?? "",
                      confirm_label: n.follow_gate_confirm_label ?? "",
                      profile_label: n.follow_gate_profile_label ?? "",
                    }
                  : {},
      }))
    );
    setEdges(graph.edges.map((e) => ({ id: e.id, source: e.source_node_id, sourceHandle: e.source_handle, target: e.target_node_id })));
    setLoaded(true);
  }, [graph, loaded, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds.filter((e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle))));
    },
    [setEdges]
  );

  const addNode = (type: "message" | "condition" | "quick_reply" | "follow_gate") => {
    const id = crypto.randomUUID();
    const offset = nodes.length * 40;
    const data =
      type === "message"
        ? { message: "", file_base64: null, file_mimetype: null, file_filename: null }
        : type === "condition"
          ? { keywords: [], use_ai: false }
          : type === "quick_reply"
            ? { message: "", options: [] }
            : { message: "", retry_message: "", confirm_label: "", profile_label: "" };
    setNodes((nds) => [...nds, { id, type, position: { x: 380 + offset, y: 120 + offset }, deletable: true, data }]);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFunnelGraph(
        funnelId,
        nodes.map((n) => ({
          id: n.id,
          type: n.type as "trigger" | "message" | "condition" | "quick_reply" | "follow_gate",
          position_x: n.position.x,
          position_y: n.position.y,
          message:
            n.type === "message"
              ? ((n.data as MessageData).message ?? null)
              : n.type === "quick_reply"
                ? ((n.data as QuickReplyData).message ?? null)
                : n.type === "follow_gate"
                  ? ((n.data as FollowGateData).message ?? null)
                  : null,
          file_base64: n.type === "message" ? (n.data as MessageData).file_base64 : null,
          file_mimetype: n.type === "message" ? (n.data as MessageData).file_mimetype : null,
          file_filename: n.type === "message" ? (n.data as MessageData).file_filename : null,
          condition_keywords: n.type === "condition" ? (n.data as ConditionData).keywords : [],
          condition_use_ai: n.type === "condition" ? (n.data as ConditionData).use_ai : false,
          quick_reply_options: n.type === "quick_reply" ? (n.data as QuickReplyData).options : [],
          follow_gate_retry_message: n.type === "follow_gate" ? (n.data as FollowGateData).retry_message || null : null,
          follow_gate_confirm_label: n.type === "follow_gate" ? (n.data as FollowGateData).confirm_label || null : null,
          follow_gate_profile_label: n.type === "follow_gate" ? (n.data as FollowGateData).profile_label || null : null,
        })),
        edges.map((e) => ({ source_node_id: e.source, source_handle: e.sourceHandle ?? null, target_node_id: e.target }))
      ),
    onSuccess: () => {
      toast.success("Funil salvo.");
      queryClient.invalidateQueries({ queryKey: ["instagram-funnel-graph", funnelId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar funil"),
  });

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Link to="/admin/instagram-funil" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold flex-1 min-w-0 truncate">{funnelName}</h1>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addNode("message")}>
          <Plus className="h-3.5 w-3.5" /> Mensagem
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addNode("condition")}>
          <Plus className="h-3.5 w-3.5" /> Condição
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addNode("quick_reply")}>
          <Plus className="h-3.5 w-3.5" /> Botões
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addNode("follow_gate")}>
          <Plus className="h-3.5 w-3.5" /> Seguir
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTestOpen(true)}>
          <FlaskConical className="h-3.5 w-3.5" /> Testar funil
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </header>

      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => { if (node.type !== "trigger") setEditingNode(node); }}
          nodeTypes={nodeTypes}
          fitView
          colorMode={theme}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      <Dialog open={!!editingNode} onOpenChange={(o) => !o && setEditingNode(null)}>
        {editingNode?.type === "message" && (
          <MessageNodeEditor
            data={editingNode.data as MessageData}
            onSave={(patch) => {
              setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
              setEditingNode(null);
            }}
          />
        )}
        {editingNode?.type === "condition" && (
          <ConditionNodeEditor
            data={editingNode.data as ConditionData}
            onSave={(patch) => {
              setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
              setEditingNode(null);
            }}
          />
        )}
        {editingNode?.type === "quick_reply" && (
          <QuickReplyNodeEditor
            data={editingNode.data as QuickReplyData}
            onSave={(patch) => {
              setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
              setEditingNode(null);
            }}
          />
        )}
        {editingNode?.type === "follow_gate" && (
          <FollowGateNodeEditor
            data={editingNode.data as FollowGateData}
            onSave={(patch) => {
              setNodes((nds) => nds.map((n) => (n.id === editingNode.id ? { ...n, data: { ...n.data, ...patch } } : n)));
              setEditingNode(null);
            }}
          />
        )}
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <TestFunnelDialog funnelId={funnelId} onClose={() => setTestOpen(false)} />
      </Dialog>
    </div>
  );
}

// Manda o funil de verdade pra um contato que já tem conversa aberta (janela
// de 24h) — sem precisar de um comentário/story real. Ver runFunnelTest em
// instagram-webhook.ts.
function TestFunnelDialog({ funnelId, onClose }: { funnelId: string; onClose: () => void }) {
  const [igUserId, setIgUserId] = useState("");

  const { data: conversations = [], isLoading } = useQuery({ queryKey: ["instagram-conversations"], queryFn: fetchConversations });

  const testMutation = useMutation({
    mutationFn: () => testFunnel(funnelId, igUserId),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success("Teste enviado — confere o Direct do contato escolhido.");
        onClose();
      } else {
        toast.error(result.error ?? "Erro ao testar o funil.");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao testar o funil"),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Testar funil</DialogTitle>
      </DialogHeader>
      <div className="py-2 space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando conversas...</p>
        ) : conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conversa ainda pra testar. Precisa de um contato que já tenha trocado Direct com a conta
            conectada (a janela de 24h precisa estar aberta) — manda um Direct qualquer pra sua própria conta e ele
            aparece aqui.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <Select value={igUserId} onValueChange={setIgUserId}>
                <SelectTrigger><SelectValue placeholder="Escolha um contato" /></SelectTrigger>
                <SelectContent>
                  {conversations.map((c) => (
                    <SelectItem key={c.ig_user_id} value={c.ig_user_id}>
                      {c.ig_username ? `@${c.ig_username}` : c.ig_user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Manda o funil de verdade a partir do bloco Gatilho pra esse contato — não cria lead na aba Leads.
            </p>
          </>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => testMutation.mutate()} disabled={!igUserId || testMutation.isPending}>
          {testMutation.isPending ? "Enviando..." : "Enviar teste"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // limite da própria Meta pra anexo

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type MessagePatch = Pick<MessageData, "message" | "file_base64" | "file_mimetype" | "file_filename">;

function MessageNodeEditor({ data, onSave }: { data: MessageData; onSave: (patch: MessagePatch) => void }) {
  const [message, setMessage] = useState(data.message);
  const [file, setFile] = useState({ base64: data.file_base64, mimetype: data.file_mimetype, filename: data.file_filename });

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      toast.error("Arquivo maior que 25MB — limite da própria API do Instagram.");
      return;
    }
    const base64 = await readFileAsBase64(f);
    setFile({ base64, mimetype: f.type || "application/octet-stream", filename: f.name });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Enviar mensagem</DialogTitle>
      </DialogHeader>
      <div className="py-2 space-y-4">
        <div className="space-y-1.5">
          <Label>Texto do DM</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[100px]"
            autoFocus
            disabled={!!file.base64}
            placeholder={file.base64 ? "Ignorado enquanto tiver um arquivo anexado" : undefined}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Anexo (opcional — ex: PDF)</Label>
          {file.base64 ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{file.filename}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setFile({ base64: null, mimetype: null, filename: null })}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Input type="file" onChange={(e) => handleFile(e.target.files?.[0])} />
          )}
          <p className="text-[11px] text-muted-foreground">
            Anexando um arquivo, a mensagem manda só ele (o texto acima é ignorado). Até 25MB.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({ message, file_base64: file.base64, file_mimetype: file.mimetype, file_filename: file.filename })}>
          Salvar bloco
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

type ConditionPatch = { keywords: { id: string; keyword: string }[]; use_ai: boolean };

function ConditionNodeEditor({ data, onSave }: { data: ConditionData; onSave: (patch: ConditionPatch) => void }) {
  const [keywords, setKeywords] = useState(data.keywords);
  const [useAi, setUseAi] = useState(data.use_ai);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Condição</DialogTitle>
      </DialogHeader>
      <div className="py-2 space-y-2">
        <Label>Palavras-chave (cada uma vira uma saída no bloco)</Label>
        {keywords.map((k, i) => (
          <div key={k.id} className="flex items-center gap-2">
            <Input
              value={k.keyword}
              onChange={(e) => setKeywords((ks) => ks.map((kk, ii) => (ii === i ? { ...kk, keyword: e.target.value } : kk)))}
              placeholder="Ex: sim"
            />
            <Button size="icon" variant="ghost" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setKeywords((ks) => ks.filter((_, ii) => ii !== i))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setKeywords((ks) => [...ks, { id: crypto.randomUUID(), keyword: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar palavra-chave
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Sempre tem também uma saída fixa "Nenhuma bateu", pra quando a resposta não bater com nenhuma acima.
        </p>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 mt-3">
          <div className="min-w-0">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Classificar com IA
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Em vez de exigir a palavra exata, manda a resposta pro GPT escolher a opção mais parecida com a
              intenção (usa a chave OpenAI já configurada em Configurações).
            </p>
          </div>
          <Switch checked={useAi} onCheckedChange={setUseAi} className="shrink-0" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({ keywords: keywords.filter((k) => k.keyword.trim()), use_ai: useAi })}>Salvar bloco</Button>
      </DialogFooter>
    </DialogContent>
  );
}

const MAX_QUICK_REPLIES = 13; // limite da API de mensagens do Instagram
const MAX_QUICK_REPLY_LABEL = 20; // idem — título truncado depois disso

type QuickReplyPatch = { message: string; options: { id: string; label: string }[] };

function QuickReplyNodeEditor({ data, onSave }: { data: QuickReplyData; onSave: (patch: QuickReplyPatch) => void }) {
  const [message, setMessage] = useState(data.message);
  const [options, setOptions] = useState(data.options);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Botões</DialogTitle>
      </DialogHeader>
      <div className="py-2 space-y-4">
        <div className="space-y-1.5">
          <Label>Mensagem (obrigatória — sai junto com os botões)</Label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[80px]" autoFocus />
        </div>
        <div className="space-y-2">
          <Label>Opções (cada uma vira um botão e uma saída no bloco)</Label>
          {options.map((o, i) => (
            <div key={o.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Input
                  value={o.label}
                  onChange={(e) => setOptions((os) => os.map((oo, ii) => (ii === i ? { ...oo, label: e.target.value } : oo)))}
                  placeholder="Ex: Quero saber mais"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setOptions((os) => os.filter((_, ii) => ii !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className={`text-[11px] ${o.label.length > MAX_QUICK_REPLY_LABEL ? "text-destructive" : "text-muted-foreground"}`}>
                {o.label.length}/{MAX_QUICK_REPLY_LABEL} caracteres
                {o.label.length > MAX_QUICK_REPLY_LABEL && " — o Instagram trunca o que passar disso"}
              </p>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={options.length >= MAX_QUICK_REPLIES}
            onClick={() => setOptions((os) => [...os, { id: crypto.randomUUID(), label: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar opção {options.length >= MAX_QUICK_REPLIES && `(máximo ${MAX_QUICK_REPLIES})`}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Sempre tem também uma saída fixa "Ignorou/digitou", pra quando a pessoa digita em vez de tocar num botão.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!message.trim()}
          onClick={() => onSave({ message, options: options.filter((o) => o.label.trim()) })}
        >
          Salvar bloco
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

const GATE_DEFAULT_FIRST =
  'Falta só um passo: me segue aqui no perfil 👀\n\nAssim que seguir, clica em "Já segui" que eu libero sua mensagem na hora 👇';
const GATE_DEFAULT_RETRY = "Ainda não te encontrei seguindo 👀 segue rapidinho que eu libero na hora!";

type FollowGatePatch = { message: string; retry_message: string; confirm_label: string; profile_label: string };

function FollowGateNodeEditor({ data, onSave }: { data: FollowGateData; onSave: (patch: FollowGatePatch) => void }) {
  const [message, setMessage] = useState(data.message);
  const [retryMessage, setRetryMessage] = useState(data.retry_message);
  const [confirmLabel, setConfirmLabel] = useState(data.confirm_label);
  const [profileLabel, setProfileLabel] = useState(data.profile_label);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Seguir</DialogTitle>
      </DialogHeader>
      <div className="py-2 space-y-4">
        <div className="space-y-1.5">
          <Label>Texto (1ª vez)</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={GATE_DEFAULT_FIRST}
            className="min-h-[90px]"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Texto (se clicar em "Já segui" sem ter seguido)</Label>
          <Textarea
            value={retryMessage}
            onChange={(e) => setRetryMessage(e.target.value)}
            placeholder={GATE_DEFAULT_RETRY}
            className="min-h-[70px]"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Botão "Ver perfil"</Label>
            <Input value={profileLabel} onChange={(e) => setProfileLabel(e.target.value)} placeholder="Ver perfil 👀" maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label>Botão "Já segui"</Label>
            <Input value={confirmLabel} onChange={(e) => setConfirmLabel(e.target.value)} placeholder="Já segui 💙" maxLength={20} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Deixe em branco pra usar o texto/rótulo padrão do sistema.</p>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSave({ message, retry_message: retryMessage, confirm_label: confirmLabel, profile_label: profileLabel })
          }
        >
          Salvar bloco
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
