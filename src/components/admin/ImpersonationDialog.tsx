import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Search, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface UserRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  poste: string | null;
  roles: string[];
}

export function ImpersonationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const { startImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("user_id, first_name, last_name, poste").order("first_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const rolesByUser = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      });
      const rows: UserRow[] = (profiles ?? [])
        .filter((p: any) => p.user_id !== user?.id)
        .map((p: any) => ({
          user_id: p.user_id,
          first_name: p.first_name,
          last_name: p.last_name,
          poste: p.poste,
          roles: rolesByUser.get(p.user_id) ?? [],
        }));
      setUsers(rows);
      setLoading(false);
    })();
  }, [open, user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.toLowerCase();
      return name.includes(q) || (u.poste ?? "").toLowerCase().includes(q) || u.roles.some((r) => r.toLowerCase().includes(q));
    });
  }, [users, search]);

  async function handlePick(u: UserRow) {
    await startImpersonation(u.user_id);
    onOpenChange(false);
    navigate("/apps");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-orange-500" />
            Voir comme un utilisateur
          </DialogTitle>
          <DialogDescription>
            Mode aperçu temporaire : vous verrez l'app avec les rôles et permissions de l'utilisateur sélectionné.
            Aucune modification ne sera enregistrée.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, poste, rôle..." className="pl-9" />
        </div>
        <div className="max-h-[420px] overflow-y-auto space-y-1.5 -mx-2 px-2">
          {loading && <p className="text-sm text-muted-foreground p-4 text-center">Chargement...</p>}
          {!loading && filtered.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Aucun utilisateur trouvé.</p>}
          {filtered.map((u) => {
            const initials = `${(u.first_name ?? "")[0] ?? ""}${(u.last_name ?? "")[0] ?? ""}`.toUpperCase() || "?";
            const name = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Sans nom";
            return (
              <button
                key={u.user_id}
                onClick={() => handlePick(u)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border hover:border-primary/40 hover:bg-accent/40 transition-all text-left"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{name}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.poste ?? "—"}</div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end max-w-[40%]">
                  {u.roles.length === 0 ? (
                    <Badge variant="outline" className="text-[10px]">aucun rôle</Badge>
                  ) : u.roles.map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px] capitalize">{r.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
