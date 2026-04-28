import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GlobalSearchPalette } from "@/components/search/GlobalSearchPalette";

interface GlobalSearchCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const Ctx = createContext<GlobalSearchCtx | null>(null);

/**
 * Provider global pour la palette de recherche ⌘K / Ctrl+K.
 * Monte le composant `GlobalSearchPalette` une seule fois et écoute les
 * raccourcis clavier au niveau du document.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K (mac) ou Ctrl+K (autres)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" raccourci si l'utilisateur n'est pas en train de taper dans un champ
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable = target?.isContentEditable;
        if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT" && !editable) {
          e.preventDefault();
          setOpen(true);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<GlobalSearchCtx>(() => ({ open, setOpen, toggle }), [open, toggle]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <GlobalSearchPalette open={open} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

export function useGlobalSearchPalette(): GlobalSearchCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback no-op pour permettre le rendu hors provider (tests, pages publiques)
    return { open: false, setOpen: () => {}, toggle: () => {} };
  }
  return ctx;
}
