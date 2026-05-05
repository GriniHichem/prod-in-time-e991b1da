import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Patch supabase client to block writes while in impersonation (preview) mode.
// Reads remain untouched.

let installed = false;
let originalFrom: typeof supabase.from | null = null;
let originalInvoke: typeof supabase.functions.invoke | null = null;
let originalRpc: typeof supabase.rpc | null = null;

function blockedResult(label: string) {
  toast.warning("Mode aperçu : action non enregistrée", {
    description: `L'opération « ${label} » est désactivée car vous visualisez l'app comme un autre utilisateur.`,
  });
  return Promise.resolve({ data: null, error: { message: "Impersonation preview: writes are disabled", name: "ImpersonationGuard" } as any });
}

export function installImpersonationGuard() {
  if (installed) return;
  installed = true;

  originalFrom = supabase.from.bind(supabase);
  originalInvoke = supabase.functions.invoke.bind(supabase.functions);
  originalRpc = supabase.rpc.bind(supabase);

  // Patch from()
  (supabase as any).from = (table: string) => {
    const builder: any = originalFrom!(table as any);
    const wrap = (method: string) => {
      const orig = builder[method]?.bind(builder);
      if (!orig) return;
      builder[method] = (..._args: any[]) => {
        const stub: any = blockedResult(`${method} sur ${table}`);
        // Make it thenable AND return a chainable proxy with no-op .select/.eq/etc.
        const proxy: any = new Proxy(stub, {
          get(target, prop) {
            if (prop === "then" || prop === "catch" || prop === "finally") {
              return (target as Promise<any>)[prop as any].bind(target);
            }
            // chainable no-ops returning the same proxy
            return () => proxy;
          },
        });
        return proxy;
      };
    };
    ["insert", "update", "delete", "upsert"].forEach(wrap);
    return builder;
  };

  // Patch functions.invoke
  (supabase.functions as any).invoke = (name: string, _opts?: any) => {
    return blockedResult(`fonction ${name}`);
  };

  // Patch rpc (RPCs may mutate state)
  (supabase as any).rpc = (fn: string, _params?: any, _opts?: any) => {
    return blockedResult(`RPC ${fn}`);
  };
}

export function uninstallImpersonationGuard() {
  if (!installed) return;
  installed = false;
  if (originalFrom) (supabase as any).from = originalFrom;
  if (originalInvoke) (supabase.functions as any).invoke = originalInvoke;
  if (originalRpc) (supabase as any).rpc = originalRpc;
  originalFrom = null;
  originalInvoke = null;
  originalRpc = null;
}

export function isImpersonationGuardActive() {
  return installed;
}
