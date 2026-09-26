import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquareText, Plus, Tag as TagIcon, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  assignTag,
  createTag,
  deleteTag,
  fetchContacts,
  fetchTags,
  removeTag,
  TAG_COLORS,
  type ContactRow,
} from "@/server/instagram-contacts";
import { EmBreve } from "@/components/EmBreve";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Admin" }] }),
  validateSearch: z.object({ tag: z.string().optional() }),
  component: ContatosPage,
});

const SOURCE_LABEL: Record<string, string> = {
  comment: "Comentário",
  story_reply: "Resposta a story",
  direct: "Mensagem direta",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ContatosPage() {
  const { tag } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const { data: tags = [] } = useQuery({ queryKey: ["instagram-tags"], queryFn: fetchTags });
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["instagram-contacts", tag ?? null],
    queryFn: () => fetchContacts(tag),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["instagram-tags"] });
    queryClient.invalidateQueries({ queryKey: ["instagram-contacts"] });
  };

  if (!isLoading && contacts.length === 0 && !tag) {
    return (
      <AppShell>
        <EmBreve
          icon={Users}
          title="Contatos"
          description="Ninguém trocou Direct com o seu Instagram ainda. Assim que a primeira conversa acontecer, ela aparece aqui."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Contatos</h1>
            <p className="text-sm text-muted-foreground">Todo mundo que já trocou Direct com o seu Instagram.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={tag ?? "all"}
              onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, tag: v === "all" ? undefined : v }) })}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todas as tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as tags</SelectItem>
                {tags.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ManageTagsDialog tags={tags} onChanged={invalidateAll} />
          </div>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-12 text-center">Nenhum contato com essa tag ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contato</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Última interação</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Conversa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <ContactTableRow key={c.ig_user_id} contact={c} allTags={tags} onChanged={invalidateAll} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}

function ContactTableRow({
  contact,
  allTags,
  onChanged,
}: {
  contact: ContactRow;
  allTags: { id: string; name: string; color: string }[];
  onChanged: () => void;
}) {
  const toggleMutation = useMutation({
    mutationFn: ({ tagId, assigned }: { tagId: string; assigned: boolean }) =>
      assigned ? removeTag(contact.ig_user_id, tagId) : assignTag(contact.ig_user_id, tagId),
    onSuccess: onChanged,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar tag"),
  });

  const assignedIds = new Set(contact.tags.map((t) => t.id));

  return (
    <TableRow>
      <TableCell className="font-medium">{contact.ig_username ? `@${contact.ig_username}` : contact.ig_user_id}</TableCell>
      <TableCell>
        {contact.source_type ? (
          <div className="text-sm">
            <span>{SOURCE_LABEL[contact.source_type] ?? contact.source_type}</span>
            {contact.source_detail && <span className="text-muted-foreground"> — "{contact.source_detail}"</span>}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatTime(contact.last_message_at)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 flex-wrap">
          {contact.tags.map((t) => (
            <Badge key={t.id} style={{ backgroundColor: t.color }} className="text-white">
              {t.name}
            </Badge>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              {allTags.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">Crie uma tag em "Gerenciar tags" primeiro.</p>
              ) : (
                <div className="space-y-1">
                  {allTags.map((t) => {
                    const assigned = assignedIds.has(t.id);
                    return (
                      <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox
                          checked={assigned}
                          onCheckedChange={() => toggleMutation.mutate({ tagId: t.id, assigned })}
                        />
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </label>
                    );
                  })}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/caixa-entrada" search={{ ig: contact.ig_user_id }}>
            <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
            Ver conversa
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ManageTagsDialog({ tags, onChanged }: { tags: { id: string; name: string; color: string }[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[0]);

  const createMutation = useMutation({
    mutationFn: () => createTag(name.trim(), color),
    onSuccess: () => {
      setName("");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao criar tag"),
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => deleteTag(tagId),
    onSuccess: onChanged,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao apagar tag"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <TagIcon className="h-4 w-4 mr-1.5" />
          Gerenciar tags
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            {tags.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tag criada ainda.</p>}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <Badge style={{ backgroundColor: t.color }} className="text-white">
                  {t.name}
                </Badge>
                <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <Label htmlFor="new-tag-name">Nova tag</Label>
            <Input
              id="new-tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da tag"
              maxLength={40}
            />
            <div className="flex items-center gap-2 flex-wrap">
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn("h-6 w-6 rounded-full", color === c && "ring-2 ring-offset-2 ring-foreground")}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!name.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Criar tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
