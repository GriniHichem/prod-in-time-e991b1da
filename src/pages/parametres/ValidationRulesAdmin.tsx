import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Copy, Search, RotateCcw } from "lucide-react";
import { useValidationPermissions } from "@/hooks/useValidationPermissions";
import { RuleEditorDialog } from "@/components/validations/RuleEditorDialog";
import { ENFORCEMENT_LABEL, PRIORITY_LABEL, PRIORITY_BADGE_CLASS, type ValidationRule } from "@/lib/validation";
import { toast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit";
import { findDuplicates } from "@/lib/ruleValidation";
import { MODULE_LABEL, MODULES } from "@/lib/ruleCatalog";

const NONE = "__all__";

export default function ValidationRulesAdmin() {
  const perm = useValidationPermissions();
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [impact, setImpact] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ValidationRule | null>(null);
  const [open, setOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>(NONE);
  const [stateFilter, setStateFilter] = useState<string>(NONE);
  const [enforcementFilter, setEnforcementFilter] = useState<string>(NONE);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("validation_rules").select("*").order("module").order("name");
    setRules((data as unknown as ValidationRule[]) ?? []);

    // Impact: number of requests generated per rule over the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: reqs } = await supabase
      .from("validation_requests")
      .select("rule_id")
      .gte("created_at", since)
      .limit(5000);
    const counts: Record<string, number> = {};
    for (const r of (reqs ?? []) as Array<{ rule_id: string | null }>) {
      if (r.rule_id) counts[r.rule_id] = (counts[r.rule_id] ?? 0) + 1;
    }
    setImpact(counts);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const duplicateIds = useMemo(() => {
    const set = new Set<string>();
    const dups = findDuplicates(
      rules.map((r) => ({ id: r.id, module: r.module, conditions: r.conditions, is_active: r.is_active })),
      (r) => (rules.find((x) => x.id === r.id)?.action_type ?? "")
    );
    dups.forEach((ids) => ids.forEach((id) => set.add(id)));
    return set;
  }, [rules]);

  const filtersActive = search.trim() !== "" || moduleFilter !== NONE || stateFilter !== NONE || enforcementFilter !== NONE;

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (moduleFilter !== NONE && r.module !== moduleFilter) return false;
      if (stateFilter === "active" && !r.is_active) return false;
      if (stateFilter === "inactive" && r.is_active) return false;
      if (enforcementFilter !== NONE && r.enforcement !== enforcementFilter) return false;
      if (s) {
        const hay = `${r.name} ${r.description ?? ""} ${r.action_type} ${MODULE_LABEL[r.module] ?? r.module}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rules, search, moduleFilter, stateFilter, enforcementFilter]);

  const grouped = useMemo(() => {
    const m = new Map<string, ValidationRule[]>();
    for (const r of filtered) {
      const arr = m.get(r.module) ?? [];
      arr.push(r);
      m.set(r.module, arr);
    }
    return Array.from(m.entries()).sort((a, b) =>
      (MODULE_LABEL[a[0]] ?? a[0]).localeCompare(MODULE_LABEL[b[0]] ?? b[0])
    );
  }, [filtered]);

  const resetFilters = () => {
    setSearch(""); setModuleFilter(NONE); setStateFilter(NONE); setEnforcementFilter(NONE);
  };

  const toggleActive = async (r: ValidationRule) => {
    const newVal = !r.is_active;
    const { error } = await supabase.from("validation_rules").update({ is_active: newVal } as never).eq("id", r.id);
    if (error) { toast({ title: "Erreur", variant: "destructive" }); return; }
    await logAudit({
      action_type: "status_change",
      module: "system",
      entity_type: "validation_rule",
      entity_id: r.id,
      entity_label: r.name,
      severity: "medium",
      old_values: { is_active: r.is_active },
      new_values: { is_active: newVal },
    });
    void load();
  };

  const duplicate = async (r: ValidationRule) => {
    const payload = {
      name: `${r.name} (copie)`,
      description: r.description,
      module: r.module,
      entity_type: r.entity_type,
      action_type: r.action_type,
      enforcement: r.enforcement,
      priority: r.priority,
      is_active: false,
      is_required: r.is_required,
      validator_roles: r.validator_roles,
      validator_users: r.validator_users,
      auto_approve_if_low_risk: r.auto_approve_if_low_risk,
      conditions: r.conditions,
    };
    const { error } = await supabase.from("validation_rules").insert(payload as never);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Règle dupliquée", description: "La copie est inactive — vérifiez-la avant activation." });
    void load();
  };

  const remove = async (r: ValidationRule) => {
    if (!confirm(`Supprimer la règle "${r.name}" ?`)) return;
    const { error } = await supabase.from("validation_rules").delete().eq("id", r.id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    await logAudit({
      action_type: "delete",
      module: "system",
      entity_type: "validation_rule",
      entity_id: r.id,
      entity_label: r.name,
      severity: "high",
      old_values: r as unknown as Record<string, unknown>,
    });
    toast({ title: "Règle supprimée" });
    void load();
  };

  if (!perm.configure_rules && !perm.loading) {
    return <div className="text-center text-muted-foreground py-12">Accès refusé.</div>;
  }

  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Règles de validation</h1>
          <p className="text-muted-foreground">
            {rules.length} règle(s) · {activeCount} active(s) · le module n'agit que sur les actions couvertes par une règle active.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nouvelle règle
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une règle…"
            className="pl-8"
          />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Tous les modules</SelectItem>
            {MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="État" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Tous états</SelectItem>
            <SelectItem value="active">Actives</SelectItem>
            <SelectItem value="inactive">Inactives</SelectItem>
          </SelectContent>
        </Select>
        <Select value={enforcementFilter} onValueChange={setEnforcementFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Mode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Tous modes</SelectItem>
            <SelectItem value="blocking">Bloquante</SelectItem>
            <SelectItem value="post_hoc">A posteriori</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button variant="ghost" size="icon" onClick={resetFilters} title="Réinitialiser les filtres">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">Aucune règle ne correspond.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([mod, list]) => (
            <div key={mod} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {MODULE_LABEL[mod] ?? mod}
                </h2>
                <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((r) => (
                  <Card key={r.id} className={r.is_active ? "" : "opacity-70"}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium flex items-center gap-1.5">
                            {r.name}
                            {duplicateIds.has(r.id) && (
                              <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-600">
                                Doublon
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">{r.module} / {r.action_type}</p>
                        </div>
                        <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                      </div>
                      {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className={r.enforcement === "blocking" ? "border-orange-500/30 text-orange-600" : ""}>
                          {ENFORCEMENT_LABEL[r.enforcement]}
                        </Badge>
                        <Badge variant="outline" className={PRIORITY_BADGE_CLASS[r.priority]}>{PRIORITY_LABEL[r.priority]}</Badge>
                        {(impact[r.id] ?? 0) > 0 && (
                          <Badge variant="secondary" className="text-[10px]">{impact[r.id]} demande(s)/30j</Badge>
                        )}
                        {(r.validator_roles ?? []).map((role) => (
                          <Badge key={role} variant="secondary">{role.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" /> Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => duplicate(r)}>
                          <Copy className="h-4 w-4 mr-2" /> Dupliquer
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <RuleEditorDialog open={open} onOpenChange={setOpen} rule={editing} onSaved={load} />
    </div>
  );
}
