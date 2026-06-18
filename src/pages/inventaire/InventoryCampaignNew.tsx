import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Users, FolderTree, Trash2, Package, Factory } from "lucide-react";
import { useInventoryPermissions } from "@/hooks/useInventoryPermissions";

type Family = { id: string; name: string; parent_id: string | null };
type Profile = { user_id: string; first_name: string; last_name: string };

type AgentRow = { agent_id: string; role: "agent_a" | "agent_b" | "agent_c"; family_ids: string[] };
type CampaignType = "pdr" | "investissement";

export default function InventoryCampaignNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { canManage } = useInventoryPermissions();

  const [families, setFamilies] = useState<Family[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [campaignType, setCampaignType] = useState<CampaignType>("pdr");
  // Investissement categories
  const [scopeMachines, setScopeMachines] = useState(true);
  const [scopeEquipements, setScopeEquipements] = useState(true);
  const [scopeOrganes, setScopeOrganes] = useState(true);
  const [dateFin, setDateFin] = useState("");
  const [scopeFamilies, setScopeFamilies] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([
    { agent_id: "", role: "agent_a", family_ids: [] },
    { agent_id: "", role: "agent_b", family_ids: [] },
  ]);
  const [saving, setSaving] = useState(false);

  // Load families based on selected type
  useEffect(() => {
    (async () => {
      const table = campaignType === "pdr" ? "pdr_families" : "machine_families";
      const nameCol = campaignType === "pdr" ? "name" : "name";
      const { data: fam } = await supabase
        .from(table as any)
        .select(`id,${nameCol},parent_id`)
        .eq("is_active", true)
        .order(nameCol);
      setFamilies(((fam as any) || []) as Family[]);
      // Reset family-dependent selections when switching type
      setScopeFamilies([]);
      setAgents((prev) => prev.map((a) => ({ ...a, family_ids: [] })));
    })();
  }, [campaignType]);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("user_id,first_name,last_name").order("first_name");
      setProfiles((prof || []) as Profile[]);
    })();
  }, []);

  if (!canManage) {
    return <div className="p-8 text-center text-muted-foreground">Accès réservé au responsable d'inventaire.</div>;
  }

  function toggleFamily(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  function updateAgent(idx: number, patch: Partial<AgentRow>) {
    setAgents((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function addAgentC() {
    if (agents.some((a) => a.role === "agent_c")) return;
    setAgents((prev) => [...prev, { agent_id: "", role: "agent_c", family_ids: [] }]);
  }

  async function handleSave() {
    if (!label.trim()) { toast({ title: "Libellé requis", variant: "destructive" }); return; }
    if (campaignType === "investissement" && !scopeMachines && !scopeEquipements && !scopeOrganes) {
      toast({ title: "Choisissez au moins une catégorie (machine / équipement / organe)", variant: "destructive" }); return;
    }
    if (scopeFamilies.length === 0) { toast({ title: "Choisissez au moins une famille", variant: "destructive" }); return; }
    const validAgents = agents.filter((a) => a.agent_id);
    if (!validAgents.find((a) => a.role === "agent_a") || !validAgents.find((a) => a.role === "agent_b")) {
      toast({ title: "Agent A et Agent B requis", variant: "destructive" }); return;
    }

    setSaving(true);
    const { data: camp, error } = await (supabase.from("inventory_campaigns" as any) as any).insert({
      label: label.trim(),
      description: description.trim() || null,
      campaign_type: campaignType,
      scope_pdr: campaignType === "pdr",
      scope_machines: campaignType === "investissement" ? scopeMachines : false,
      scope_equipements: campaignType === "investissement" ? scopeEquipements : false,
      scope_organes: campaignType === "investissement" ? scopeOrganes : false,
      date_fin_prevue: dateFin || null,
      responsable_id: user?.id ?? null,
      created_by: user?.id ?? null,
      status: "draft",
    }).select("id").single();
    if (error || !camp) { toast({ title: "Erreur", description: error?.message, variant: "destructive" }); setSaving(false); return; }
    const campaignId = (camp as any).id as string;

    // Périmètre campagne
    await (supabase.from("inventory_campaign_scopes" as any) as any).insert(
      scopeFamilies.map((fid) => ({ campaign_id: campaignId, family_id: fid, include_children: true })),
    );

    // Agents
    for (const a of validAgents) {
      const { data: assn } = await (supabase.from("inventory_assignments" as any) as any)
        .insert({ campaign_id: campaignId, agent_id: a.agent_id, role: a.role, is_active: true })
        .select("id").single();
      const assnId = (assn as any)?.id as string | undefined;
      if (assnId && a.family_ids.length > 0) {
        await (supabase.from("inventory_assignment_scopes" as any) as any).insert(
          a.family_ids.map((fid) => ({ assignment_id: assnId, family_id: fid, include_children: true })),
        );
      }
    }

    toast({ title: "Campagne créée", description: "Vous pouvez maintenant la lancer." });
    setSaving(false);
    navigate(`/inventaire/campagnes/${campaignId}`);
  }

  const familyLabel = campaignType === "pdr" ? "familles PDR" : "familles de machine";

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inventaire/campagnes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Nouvelle campagne d'inventaire</h1>
      </div>

      <Card><CardContent className="p-4 space-y-4">
        {/* Type de campagne */}
        <div>
          <Label>Type de campagne *</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => setCampaignType("pdr")}
              className={`flex items-center gap-3 border rounded-lg p-3 text-left transition ${campaignType === "pdr" ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/30"}`}
            >
              <Package className="h-5 w-5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-sm">PDR (pièces de rechange)</div>
                <div className="text-xs text-muted-foreground">Inventaire des pièces par famille PDR</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setCampaignType("investissement")}
              className={`flex items-center gap-3 border rounded-lg p-3 text-left transition ${campaignType === "investissement" ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:bg-muted/30"}`}
            >
              <Factory className="h-5 w-5 text-primary shrink-0" />
              <div>
                <div className="font-semibold text-sm">Investissement</div>
                <div className="text-xs text-muted-foreground">Machines, équipements, organes par famille de machine</div>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label>Libellé *</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={campaignType === "pdr" ? "Ex: Inventaire annuel PDR T1" : "Ex: Inventaire investissement 2026"} /></div>
          <div><Label>Date de fin prévue</Label><Input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} /></div>
        </div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>

        {campaignType === "investissement" && (
          <div>
            <Label>Catégories à inventorier *</Label>
            <div className="flex items-center gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={scopeMachines} onCheckedChange={(v) => setScopeMachines(!!v)} /> Machines</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={scopeEquipements} onCheckedChange={(v) => setScopeEquipements(!!v)} /> Équipements</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={scopeOrganes} onCheckedChange={(v) => setScopeOrganes(!!v)} /> Organes</label>
            </div>
          </div>
        )}
      </CardContent></Card>

      <Card>
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Périmètre — {familyLabel} concernées</h3>
        </div>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {families.length === 0 ? (
              <div className="text-sm text-muted-foreground col-span-full">Aucune famille disponible.</div>
            ) : families.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm border rounded p-2 hover:bg-muted/30 cursor-pointer">
                <Checkbox checked={scopeFamilies.includes(f.id)} onCheckedChange={() => setScopeFamilies((p) => toggleFamily(p, f.id))} />
                <span className="truncate">{f.name}{f.parent_id && <Badge variant="outline" className="ml-2 text-[10px]">sous-famille</Badge>}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Affectations — Agents A / B (et C arbitre)</h3></div>
          {!agents.some((a) => a.role === "agent_c") && (
            <Button type="button" variant="outline" size="sm" onClick={addAgentC}>+ Ajouter Agent C (arbitre)</Button>
          )}
        </div>
        <CardContent className="p-4 space-y-4">
          {agents.map((a, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Badge className={a.role === "agent_a" ? "bg-blue-500/15 text-blue-700" : a.role === "agent_b" ? "bg-emerald-500/15 text-emerald-700" : "bg-amber-500/15 text-amber-700"}>
                  {a.role === "agent_a" ? "Agent A" : a.role === "agent_b" ? "Agent B" : "Agent C (arbitre)"}
                </Badge>
                {a.role === "agent_c" && (
                  <Button variant="ghost" size="icon" onClick={() => setAgents((p) => p.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div>
                <Label>Utilisateur</Label>
                <select className="w-full border rounded-md h-10 px-3 bg-background"
                        value={a.agent_id} onChange={(e) => updateAgent(idx, { agent_id: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {profiles.map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.first_name} {p.last_name}</option>
                  ))}
                </select>
              </div>
              {a.role !== "agent_c" && (
                <div>
                  <Label className="text-xs">Familles autorisées (sous-ensemble du périmètre campagne)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 max-h-40 overflow-y-auto">
                    {scopeFamilies.length === 0 ? (
                      <div className="text-xs text-muted-foreground col-span-2">Sélectionnez d'abord les familles du périmètre.</div>
                    ) : (
                      families.filter((f) => scopeFamilies.includes(f.id)).map((f) => (
                        <label key={f.id} className="flex items-center gap-2 text-xs border rounded p-2">
                          <Checkbox checked={a.family_ids.includes(f.id)} onCheckedChange={() => updateAgent(idx, { family_ids: toggleFamily(a.family_ids, f.id) })} />
                          <span className="truncate">{f.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/inventaire/campagnes")}>Annuler</Button>
        <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1" />{saving ? "Création…" : "Créer la campagne"}</Button>
      </div>
    </div>
  );
}
