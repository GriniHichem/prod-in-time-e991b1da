import { Button } from "@/components/ui/button";
import { IconSearch } from "@/components/icons/IndustrialIcons";
import { useGlobalSearchPalette } from "@/components/search/GlobalSearchProvider";
import { cn } from "@/lib/utils";

interface SearchTriggerProps {
  /** Variante "icon" (mobile, compact) ou "input" (desktop, large barre). */
  variant?: "icon" | "input";
  className?: string;
}

/**
 * Bouton qui ouvre la palette `⌘K`.
 * - `variant="icon"` : bouton icône carré (mobile / espaces serrés).
 * - `variant="input"` : pseudo-input avec placeholder + raccourci à droite.
 */
export function SearchTrigger({ variant = "icon", className }: SearchTriggerProps) {
  const { setOpen } = useGlobalSearchPalette();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? "⌘K" : "Ctrl+K";

  if (variant === "input") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "h-9 w-full max-w-[280px] flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
          className,
        )}
        aria-label="Recherche globale"
      >
        <IconSearch size={15} />
        <span className="flex-1 text-left truncate">Rechercher partout…</span>
        <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border/60 bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          {shortcut}
        </kbd>
      </button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setOpen(true)}
      title={`Recherche globale (${shortcut})`}
      aria-label={`Recherche globale (${shortcut})`}
      className={cn("h-9 w-9 rounded-md text-muted-foreground hover:text-foreground", className)}
    >
      <IconSearch size={18} />
    </Button>
  );
}
