import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Instagram, Link2, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/server/session";

const navItems = [
  { to: "/admin/instagram-conexao", label: "Conexão", icon: Link2 },
  { to: "/admin/instagram-funil", label: "Funil", icon: Instagram },
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="flex h-14 items-center gap-6 px-4 md:px-8">
          <span className="font-semibold tracking-tight">manychat-triad</span>
          <nav className="flex items-center gap-1 flex-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
