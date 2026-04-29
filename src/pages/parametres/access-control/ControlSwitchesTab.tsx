import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useControlSwitches } from "@/hooks/useControlSwitches";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

export default function ControlSwitchesTab() {
  const { switches, loading, setSwitch } = useControlSwitches();

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interrupteurs globaux du système</CardTitle>
        <p className="text-sm text-muted-foreground">Active ou désactive des sous-systèmes complets de l'application.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {switches.map((s) => {
          const isCritical = s.key === "control.enforce_audit" || s.key === "control.maintenance_mode";
          return (
            <div key={s.key} className="flex items-start justify-between p-4 border rounded-lg">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{s.label}</p>
                  {isCritical && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Critique</Badge>}
                  <Badge variant={s.value ? "default" : "secondary"}>{s.value ? "Activé" : "Désactivé"}</Badge>
                </div>
                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                <p className="text-xs text-muted-foreground">Clé : <code>{s.key}</code> • Modifié {new Date(s.updated_at).toLocaleString()}</p>
              </div>
              <Switch checked={s.value} onCheckedChange={(v) => setSwitch(s.key, v)} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
