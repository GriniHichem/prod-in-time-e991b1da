import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Search, ArrowLeft, Factory, ClipboardList,
  X, Save, MapPin, Layers,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

type Scope = "global" | "line" | "of" | "mixed";

interface ControlPoint {
  id: string;
  code: string;
  label: string;
  description: string | null;
  scope: Scope;
  is_active: boolean;
  sort_order: number;
}

interface LineRow { id: string; code: string; designation: string; }
interface OfRow { id: string; numero: string; statut: string; }

const SCOPE_LABEL: Record<Scope, string> = {
  global: "Global (toutes lignes/OF)",
  line: "Ligne(s) spécifique(s)",
  of: "OF spécifique(s)",
  mixed: "Mixte (lignes + OF)",
};

export default function QualiteControlPointsAdmin() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ControlPoint[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Per-CP link counts (map cpId -> { lines, ofs })
  const [linkCounts, setLinkCounts] = useState<Record<string, { lines: number; ofs: number }>>({});

  // Dialog (create / edit metadata)
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ControlPoint | null>(null);
  const [form, setForm] = useState<Partial<ControlPoint>>({});

  // Detail panel — links
  const [cpLines, setCpLines] = useState<{ id: string; production_line_id: string }[]>([]);
  const [cpOfs, setCpOfs] = useState<{ id: string; of_id: string; of: OfRow | null }[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  // Combobox state
  const [lineToAdd, setLineToAdd] = useState<string>("");
  const [ofSearch, setOfSearch] = useState("");
  const [ofResults, setOfResults] = useState<OfRow[]>([]);
  const [includeClosed, setIncludeClosed] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [{ data: cps }, { data: ls }, { data: countsLines }, { data: countsOfs }] = await Promise.all([
      supabase.from("quality_control_points").select("*").order("sort_order").order("label"),
      supabase.from("production_lines").select("id, code, designation").eq("is_active", true).order("designation"),
      (supabase.from("quality_control_point_lines") as any).select("control_point_id"),
      (supabase.from("quality_control_point_ofs") as any).select("control_point_id"),
    ]);
    setItems((cps ?? []) as ControlPoint[]);
    setLines((ls ?? []) as LineRow[]);
    const counts: Record<string, { lines: number; ofs: number }> = {};
    (countsLines ?? []).forEach((r: any) => {
      counts[r.control_point_id] = counts[r.control_point_id] ?? { lines: 0, ofs: 0 };
      counts[r.control_point_id].lines++;
    });
    (countsOfs ?? []).forEach((r: any) => {
      counts[r.control_point_id] = counts[r.control_point_id] ?? { lines: 0, ofs: 0 };
      counts[r.control_point_id].ofs++;
    });
    setLinkCounts(counts);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function loadLinks(cpId: string) {
    setLinksLoading(true);
    const [{ data: ll }, { data: oo }] = await Promise.all([
      (supabase.from("quality_control_point_lines") as any)
        .select("id, production_line_id").eq("control_point_id", cpId),
      (supabase.from("quality_control_point_ofs") as any)
        .select("id, of_id, ordres_fabrication:of_id(id, numero, statut)")
        .eq("control_point_id", cpId),
    ]);
    setCpLines((ll ?? []) as any);
    setCpOfs(((oo ?? []) as any[]).map((r) => ({ id: r.id, of_id: r.of_id, of: r.ordres_fabrication })));
    setLinksLoading(false);
  }

  useEffect(() => {
    if (selectedId) loadLinks(selectedId);
    else { setCpLines([]); setCpOfs([]); }
  }, [selectedId]);

  // OF search (debounced light)
  useEffect(() => {
    let cancel = false;
    const q = ofSearch.trim();
    if (q.length < 2) { setOfResults([]); return; }
    const t = setTimeout(async () => {
      let req: any = supabase.from("ordres_fabrication")
        .select("id, numero, statut")
        .ilike("numero", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!includeClosed) req = req.in("statut", ["planifie", "en_cours", "en_attente"]);
      const { data } = await req;
      if (!cancel) setOfResults((data ?? []) as OfRow[]);
    }, 250);
    return () => { cancel = true; clearTimeout(t); };
  }, [ofSearch, includeClosed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => (r.code + " " + r.label).toLowerCase().includes(q));
  }, [items, search]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  function openNew() {
    setEditing(null);
    setForm({
      code: "",
      label: "",
      description: "",
      scope: "global",
      is_active: true,
      sort_order: (items.length + 1) * 10,
    });
    setOpen(true);
  }
  function openEdit(cp: ControlPoint) {
    setEditing(cp);
    setForm({ ...cp });
    setOpen(true);
  }

  async function saveMeta() {
    if (!form.code?.trim() || !form.label?.trim()) {
      toast.error("Code et libellé sont obligatoires");
      return;
    }
    const payload: any = {
      code: form.code!.trim(),
      label: form.label!.trim(),
      description: form.description ?? null,
      scope: form.scope ?? "global",
      is_active: form.is_active ?? true,
      sort_order: Number(form.sort_order ?? 0) || 0,
    };
    const res = editing
      ? await supabase.from("quality_control_points").update(payload).eq("id", editing.id).select().single()
      : await supabase.from("quality_control_points").insert(payload).select().single();
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing ? "Point mis à jour" : "Point créé");
    setOpen(false);
    await loadAll();
    if (!editing && res.data) setSelectedId((res.data as any).id);
  }

  async function toggleActive(cp: ControlPoint, v: boolean) {
    const { error } = await supabase.from("quality_control_points").update({ is_active: v }).eq("id", cp.id);
    if (error) { toast.error(error.message); return; }
    setItems((s) => s.map((x) => x.id === cp.id ? { ...x, is_active: v } : x));
  }

  async function removeCp(cp: ControlPoint) {
    if (!confirm(`Supprimer "${cp.label}" ? Ses liaisons seront supprimées.`)) return;
    const { error } = await supabase.from("quality_control_points").delete().eq("id", cp.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Supprimé");
    if (selectedId === cp.id) setSelectedId(null);
    loadAll();
  }

  async function addLine() {
    if (!selectedId || !lineToAdd) return;
    const { error } = await (supabase.from("quality_control_point_lines") as any)
      .insert({ control_point_id: selectedId, production_line_id: lineToAdd });
    if (error) { toast.error(error.message); return; }
    setLineToAdd("");
    loadLinks(selectedId);
    loadAll();
  }
  async function removeLine(linkId: string) {
    const { error } = await (supabase.from("quality_control_point_lines") as any).delete().eq("id", linkId);
    if (error) { toast.error(error.message); return; }
    if (selectedId) { loadLinks(selectedId); loadAll(); }
  }
  async function addOf(ofId: string) {
    if (!selectedId) return;
    const { error } = await (supabase.from("quality_control_point_ofs") as any)
      .insert({ control_point_id: selectedId, of_id: ofId });
    if (error) { toast.error(error.message); return; }
    setOfSearch("");
    setOfResults([]);
    loadLinks(selectedId);
    loadAll();
  }
  async function removeOf(linkId: string) {
    const { error } = await (supabase.from("quality_control_point_ofs") as any).delete().eq("id", linkId);
    if (error) { toast.error(error.message); return; }
    if (selectedId) { loadLinks(selectedId); loadAll(); }
  }

  const availableLines = lines.filter((l) => !cpLines.some((cl) => cl.production_line_id === l.id));
  const linkedLineRows = cpLines
    .map((cl) => ({ link: cl, line: lines.find((l) => l.id === cl.production_line_id) }))
    .filter((x) => x.line);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/parametres/qualite")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Points de contrôle qualité
          </h1>
          <p className="text-sm text-muted-foreground">
            Postes ou étapes où s'effectuent les contrôles. Chaque point peut être global,
            rattaché à une ou plusieurs lignes, à un ou plusieurs OF, ou les deux.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />Nouveau point
        </Button>
      </div>

      {/* Master / Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* List */}
        <Card className="lg:max-h-[calc(100vh-220px)] flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">{items.length} point(s)</CardTitle>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="overflow-y-auto flex-1 p-2">
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Chargement…</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 text-sm">
                Aucun point. Cliquez sur « Nouveau point ».
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((cp) => {
                  const c = linkCounts[cp.id] ?? { lines: 0, ofs: 0 };
                  const active = cp.id === selectedId;
                  return (
                    <li key={cp.id}>
                      <button
                        onClick={() => setSelectedId(cp.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md border transition",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:bg-muted/40",
                          !cp.is_active && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">{cp.code}</Badge>
                          <span className="font-medium flex-1 truncate">{cp.label}</span>
                          {!cp.is_active && <Badge variant="secondary" className="text-xs">inactif</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Factory className="h-3 w-3" />{c.lines}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <ClipboardList className="h-3 w-3" />{c.ofs}
                          </span>
                          <span className="ml-auto">{SCOPE_LABEL[cp.scope]}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Detail */}
        <Card className="lg:max-h-[calc(100vh-220px)] flex flex-col">
          {!selected ? (
            <CardContent className="flex-1 flex items-center justify-center text-center p-12">
              <div>
                <Layers className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  Sélectionnez un point de contrôle pour gérer ses liaisons,
                  <br />ou créez-en un nouveau.
                </p>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">{selected.code}</Badge>
                      <CardTitle className="text-xl">{selected.label}</CardTitle>
                    </div>
                    {selected.description && (
                      <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="secondary">{SCOPE_LABEL[selected.scope]}</Badge>
                      <span className="text-xs text-muted-foreground">Ordre {selected.sort_order}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-2 mr-2">
                      <Label className="text-xs">Actif</Label>
                      <Switch
                        checked={selected.is_active}
                        onCheckedChange={(v) => toggleActive(selected, v)}
                      />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(selected)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeCp(selected)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-y-auto flex-1 p-4 space-y-6">
                {/* Lines section */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Factory className="h-4 w-4 text-primary" />
                      Lignes liées <Badge variant="outline">{linkedLineRows.length}</Badge>
                    </h3>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <Select value={lineToAdd} onValueChange={setLineToAdd}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={availableLines.length ? "Choisir une ligne…" : "Toutes les lignes sont liées"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLines.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            <span className="font-mono text-xs mr-2">{l.code}</span>
                            {l.designation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={addLine} disabled={!lineToAdd}>
                      <Plus className="h-4 w-4 mr-1" />Ajouter
                    </Button>
                  </div>
                  {linksLoading ? (
                    <p className="text-sm text-muted-foreground py-2">Chargement…</p>
                  ) : linkedLineRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Aucune ligne liée. Le point s'applique globalement (ou aux OF ci-dessous).
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {linkedLineRows.map(({ link, line }) => (
                        <li key={link.id} className="flex items-center justify-between p-2 rounded-md border bg-card">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">{line!.code}</Badge>
                            <span>{line!.designation}</span>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(link.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* OF section */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      OF liés <Badge variant="outline">{cpOfs.length}</Badge>
                    </h3>
                    <label className="text-xs flex items-center gap-2 text-muted-foreground">
                      <Switch checked={includeClosed} onCheckedChange={setIncludeClosed} />
                      Inclure OF clos
                    </label>
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Rechercher un OF par numéro (≥ 2 caractères)…"
                      value={ofSearch}
                      onChange={(e) => setOfSearch(e.target.value)}
                    />
                    {ofResults.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-60 overflow-auto">
                        {ofResults.map((of) => {
                          const already = cpOfs.some((x) => x.of_id === of.id);
                          return (
                            <button
                              key={of.id}
                              disabled={already}
                              onClick={() => addOf(of.id)}
                              className={cn(
                                "w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between",
                                already && "opacity-50 cursor-not-allowed",
                              )}
                            >
                              <span className="font-mono text-sm">{of.numero}</span>
                              <Badge variant="outline" className="text-xs">{of.statut}</Badge>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {cpOfs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Aucun OF lié.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {cpOfs.map((row) => (
                        <li key={row.id} className="flex items-center justify-between p-2 rounded-md border bg-card">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {row.of?.numero ?? row.of_id.slice(0, 8) + "…"}
                            </Badge>
                            {row.of?.statut && <Badge variant="secondary" className="text-xs">{row.of.statut}</Badge>}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => removeOf(row.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Create / Edit metadata dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier le point de contrôle" : "Nouveau point de contrôle"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code <span className="text-destructive">*</span></Label>
                <Input
                  value={form.code ?? ""}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="PC-01"
                />
              </div>
              <div className="space-y-1">
                <Label>Ordre</Label>
                <Input
                  type="number"
                  value={form.sort_order ?? 0}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Libellé <span className="text-destructive">*</span></Label>
              <Input
                value={form.label ?? ""}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Sortie ligne"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-1">
              <Label>Portée</Label>
              <Select
                value={(form.scope as Scope) ?? "global"}
                onValueChange={(v) => setForm({ ...form, scope: v as Scope })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
                    <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Indicatif. Vous pouvez ajouter des liaisons lignes/OF dans le panneau de droite.
              </p>
            </div>
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <Label>Actif</Label>
                <p className="text-xs text-muted-foreground">Désactivé = caché des sélecteurs</p>
              </div>
              <Switch
                checked={Boolean(form.is_active ?? true)}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={saveMeta}>
              <Save className="h-4 w-4 mr-1" />
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
