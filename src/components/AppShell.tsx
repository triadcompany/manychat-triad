import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, Users, Zap, MessageCircle, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/server/session";

const navItems = [
  { to: "/admin/inicio", label: "Início", icon: Home },
  { to: "/admin/contatos", label: "Contatos", icon: Users },
  { to: "/admin/instagram-funil", label: "Automação", icon: Zap },
  { to: "/admin/caixa-entrada", label: "Caixa de Entrada", icon: MessageCircle },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-56 shrink-0 border-r border-border flex flex-col">
        <div className="h-14 flex items-center px-4">
          <span className="font-semibold tracking-tight">DirectFlow</span>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
