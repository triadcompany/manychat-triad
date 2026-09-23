import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser, signup } from "@/server/session";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [{ title: "Criar conta — manychat-triad" }],
  }),
  component: Cadastro,
});

function Cadastro() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCurrentUser().then((user) => {
      if (user) navigate({ to: "/" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !fullName.trim() || !email.trim() || !password) return;

    setLoading(true);
    setError("");

    try {
      await signup({
        data: { companyName: companyName.trim(), fullName: fullName.trim(), email: email.trim(), password },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar a conta.");
      setLoading(false);
      return;
    }

    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center text-primary-foreground mb-3">
            <Instagram className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Criar conta</h1>
          <p className="text-sm text-muted-foreground mt-1">Comece a usar o funil de vendas via Instagram</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Nome da empresa</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Sua Empresa Ltda"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Seu nome</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" required />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
              autoComplete="email"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !companyName.trim() || !fullName.trim() || !email.trim() || password.length < 8}
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem conta?{" "}
          <Link to="/login" className="underline underline-offset-2 hover:text-foreground">
            Entrar
          </Link>
        </p>
      </Card>
    </div>
  );
}
