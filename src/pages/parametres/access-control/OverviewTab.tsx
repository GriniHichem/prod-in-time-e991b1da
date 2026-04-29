import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { onJump: (tab: string) => void }

interface Stats {
  rolesCount: number;
  customRolesCount: number;
  rolePermsCount: number;
  qualityPermsCount: number;
  usersCount: number;
}

export default function OverviewTab({ onJump }: Props) {
  const [s, setS] = useState<Stats>({ rolesCount: 13, customRolesCount: 0, rolePermsCount: 0, qualityPermsCount: 0, usersCount: 0 });

  useEffect(() => {
    (async () => {
      const [cr, rp, qp, u] = await Promise.all([
        supabase.from("custom_roles" as any).select("id", { count: "exact", head: true }),
        supabase.from("role_permissions").select("id", { count: "exact", head: true }),
        supabase.from("quality_permissions" as any).select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }),
      ]);
      setS({
        rolesCount: 13,
        customRolesCount: cr.count ?? 0,
        rolePermsCount: rp.count ?? 0,
        qualityPermsCount: qp.count ?? 0,
        usersCount: u.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "Rôles système", value: s.rolesCount, tab: "roles" },
    { label: "Rôles personnalisés", value: s.customRolesCount, tab: "roles" },
    { label: "Permissions modules", value: s.rolePermsCount, tab: "matrix" },
    { label: "Profils qualité configurés", value: s.qualityPermsCount, tab: "quality" },
    { label: "Affectations utilisateurs/rôles", value: s.usersCount, tab: "roles" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="cursor-pointer hover:border-primary/40" onClick={() => onJump(c.tab)}>
            <CardContent className="p-4">
              <p className="text-3xl font-bold text-primary">{c.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Démarrage rapide</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onJump("matrix")}>Configurer la matrice de permissions</Button>
          <Button variant="outline" onClick={() => onJump("quality")}>Définir les droits qualité</Button>
          <Button variant="outline" onClick={() => onJump("audit")}>Activer/désactiver l'audit par rôle</Button>
          <Button variant="outline" onClick={() => onJump("control")}>Interrupteurs globaux du système</Button>
          <Button variant="outline" onClick={() => onJump("portability")}>Exporter pour self-hosting</Button>
        </CardContent>
      </Card>
    </div>
  );
}
