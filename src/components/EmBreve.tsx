import type { LucideIcon } from "lucide-react";

export function EmBreve({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-24">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{description}</p>
      <span className="mt-4 inline-flex items-center rounded-full bg-accent text-accent-foreground text-xs font-medium px-3 py-1">
        Em breve
      </span>
    </div>
  );
}
