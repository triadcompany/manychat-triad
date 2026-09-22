import { createRouter, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ocorreu um erro inesperado. Tente novamente.</p>
        {import.meta.env.DEV && message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {message}
          </pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

// Durante o deploy (troca de container no EasyPanel), o navegador pode ter
// carregado o HTML já apontando pros hashes novos dos chunks, mas pegar o
// container antigo numa requisição de asset no meio da troca — isso derruba
// o import dinâmico com "Failed to fetch dynamically imported module" e cai
// na tela de erro. Um reload resolve sozinho; o guard de tempo evita loop se
// o problema for outro.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    const key = "vite-preload-reload-at";
    const last = Number(sessionStorage.getItem(key) || 0);
    const now = Date.now();
    if (now - last > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  });
}

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
