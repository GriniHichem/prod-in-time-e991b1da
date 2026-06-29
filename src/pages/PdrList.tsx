import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Package, AlertCircle, Download, ShieldAlert, DollarSign, RotateCcw, SlidersHorizontal } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { exportToCsv } from "@/lib/exportCsv";
import { EntityThumbnail } from "@/components/images/EntityThumbnail";
import { useNavWithFrom } from "@/hooks/useNavWithFrom";
import { ListScanButton } from "@/components/scanner/ListScanButton";

const STORAGE_KEY = "pdr_list_columns";

function KpiMini({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className={`flex h-9 w-9 items-center justify-center rounded-md ${color || "bg-primary/10 text-primary"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

type ColCtx = { stockBadge: (p: any) => JSX.Element };

type ColDef = {
  key: string;
  label: string;
  defaultVisible: boolean;
  alwaysOn?: boolean;
  className?: string;
  render: (p: any, ctx: ColCtx) => React.ReactNode;
  csv?: (p: any) => string | number;
};

const num = (v: any) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("fr-FR"));

const COLUMN_DEFS: ColDef[] = [
  { key: "reference", label: "Référence", defaultVisible: true, alwaysOn: true, className: "font-mono font-medium", render: (p) => p.reference, csv: (p) => p.reference },
  { key: "designation", label: "Désignation", defaultVisible: true, alwaysOn: true, className: "max-w-[200px] truncate", render: (p) => p.designation, csv: (p) => p.designation },
  { key: "famille", label: "Famille", defaultVisible: true, className: "text-muted-foreground text-sm", render: (p) => p._famille || "—", csv: (p) => p._famille || "" },
  { key: "sous_famille", label: "Sous-famille", defaultVisible: true, className: "text-muted-foreground text-sm", render: (p) => p._sousFamille || "—", csv: (p) => p._sousFamille || "" },
  {
    key: "statut",
    label: "Statut",
    defaultVisible: true,
    render: (p) => (
      <Badge variant={p.statut_pdr === "strategique" ? "destructive" : "secondary"} className="text-xs">
        {p.statut_pdr === "strategique" ? "Stratégique" : "Commune"}
      </Badge>
    ),
    csv: (p) => (p.statut_pdr === "strategique" ? "Stratégique" : "Commune"),
  },
  { key: "stock", label: "Stock", defaultVisible: true, alwaysOn: true, className: "tabular-nums font-medium", render: (p) => p.stock_actuel, csv: (p) => p.stock_actuel },
  { key: "niveau", label: "Niveau", defaultVisible: true, alwaysOn: true, render: (p, ctx) => ctx.stockBadge(p) },
  { key: "pmp", label: "PMP (DA)", defaultVisible: true, className: "tabular-nums", render: (p) => num(p.pmp), csv: (p) => p.pmp ?? "" },
  {
    key: "appro",
    label: "Appro.",
    defaultVisible: true,
    render: (p) => (
      <Badge variant="outline" className="text-xs">
        {p.approvisionnement === "importation" ? "Import" : p.approvisionnement === "mixte" ? "Mixte" : "Local"}
      </Badge>
    ),
    csv: (p) => p.approvisionnement || "local",
  },
  { key: "stock_min", label: "Stock min", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.stock_min), csv: (p) => p.stock_min ?? "" },
  { key: "stock_max", label: "Stock max", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.stock_max), csv: (p) => p.stock_max ?? "" },
  { key: "stock_securite", label: "Stock sécurité", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.stock_securite), csv: (p) => p.stock_securite ?? "" },
  { key: "point_commande", label: "Point cmd.", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.point_commande), csv: (p) => p.point_commande ?? "" },
  { key: "fournisseur", label: "Fournisseur", defaultVisible: false, className: "text-sm", render: (p) => p.fournisseur || "—", csv: (p) => p.fournisseur || "" },
  { key: "emplacement", label: "Emplacement", defaultVisible: false, className: "text-sm", render: (p) => p.emplacement || "—", csv: (p) => p.emplacement || "" },
  { key: "code_erp", label: "Code ERP", defaultVisible: false, className: "font-mono text-sm", render: (p) => p.code_erp || "—", csv: (p) => p.code_erp || "" },
  { key: "code_barres", label: "Code-barres", defaultVisible: false, className: "font-mono text-sm", render: (p) => p.code_barres || "—", csv: (p) => p.code_barres || "" },
  { key: "duree_vie_min_jours", label: "Durée vie min (j)", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.duree_vie_min_jours), csv: (p) => p.duree_vie_min_jours ?? "" },
  { key: "duree_vie_max_jours", label: "Durée vie max (j)", defaultVisible: false, className: "tabular-nums", render: (p) => num(p.duree_vie_max_jours), csv: (p) => p.duree_vie_max_jours ?? "" },
];

const defaultVisibleKeys = () => COLUMN_DEFS.filter((c) => c.defaultVisible).map((c) => c.key);

export default function PdrList() {
  const navigate = useNavWithFrom();
  const { canCreate } = usePermissions();
  const [pdrList, setPdrList] = useState<any[]>([]);
  const [entityImages, setEntityImages] = useState<any[]>([]);
  const [families, setFamilies] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filterFamily, setFilterFamily] = useState("__all__");
  const [filterStatut, setFilterStatut] = useState("__all__");
  const [filterStock, setFilterStock] = useState("__all__");

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((k) => COLUMN_DEFS.some((c) => c.key === k));
        // always-on columns must stay visible
        COLUMN_DEFS.filter((c) => c.alwaysOn).forEach((c) => {
          if (!valid.includes(c.key)) valid.push(c.key);
        });
        return valid;
      }
    } catch { /* ignore */ }
    return defaultVisibleKeys();
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleCols)); } catch { /* ignore */ }
  }, [visibleCols]);

  const toggleCol = (key: string) => {
    const def = COLUMN_DEFS.find((c) => c.key === key);
    if (def?.alwaysOn) return;
    setVisibleCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  useEffect(() => {
    const load = async () => {
      const [pRes, imgRes, fRes] = await Promise.all([
        supabase.from("pdr").select("*, pdr_families(name)").eq("is_active", true).order("reference"),
        supabase.from("entity_images").select("*").eq("entity_type", "pdr").eq("is_primary", true),
        supabase.from("pdr_families").select("*").eq("is_active", true).order("name"),
      ]);
      setPdrList(pRes.data || []);
      setEntityImages(imgRes.data || []);
      setFamilies(fRes.data || []);
    };
    load();
  }, []);

  const familyMap = useMemo(() => {
    const m = new Map<string, { name: string; parent_id: string | null }>();
    families.forEach((f) => m.set(f.id, { name: f.name, parent_id: f.parent_id || null }));
    return m;
  }, [families]);

  // enrich rows with resolved famille / sous-famille
  const enriched = useMemo(() => {
    return pdrList.map((p) => {
      const fid = (p as any).family_id as string | null;
      let famille = "";
      let sousFamille = "";
      if (fid && familyMap.has(fid)) {
        const f = familyMap.get(fid)!;
        if (f.parent_id && familyMap.has(f.parent_id)) {
          famille = familyMap.get(f.parent_id)!.name;
          sousFamille = f.name;
        } else {
          famille = f.name;
        }
      }
      return { ...p, _famille: famille, _sousFamille: sousFamille };
    });
  }, [pdrList, familyMap]);

  const filtered = useMemo(() => {
    return enriched.filter((p) => {
      if (search && !p.reference.toLowerCase().includes(search.toLowerCase()) && !p.designation.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterFamily !== "__all__" && (p as any).family_id !== filterFamily) return false;
      if (filterStatut !== "__all__" && (p as any).statut_pdr !== filterStatut) return false;
      if (filterStock === "critique" && p.stock_actuel > p.stock_min) return false;
      if (filterStock === "rupture" && p.stock_actuel > 0) return false;
      if (filterStock === "a_commander" && p.stock_actuel > (p as any).point_commande) return false;
      return true;
    });
  }, [enriched, search, filterFamily, filterStatut, filterStock]);

  const lowStock = pdrList.filter((p) => p.stock_actuel <= p.stock_min).length;
  const rupture = pdrList.filter((p) => p.stock_actuel === 0).length;
  const valeurStock = pdrList.reduce((s, p) => s + (p.stock_actuel * ((p as any).pmp || (p as any).prix_unitaire || 0)), 0);

  const stockBadge = (p: any) => {
    if (p.stock_actuel === 0) return <Badge variant="destructive" className="text-xs animate-pulse">Rupture</Badge>;
    if (p.stock_actuel <= p.stock_min) return <Badge variant="destructive" className="text-xs">Critique</Badge>;
    if (p.stock_actuel <= (p.stock_securite || 0)) return <Badge className="text-xs bg-warning text-warning-foreground">Sécurité</Badge>;
    if ((p.point_commande || 0) > 0 && p.stock_actuel <= p.point_commande) return <Badge className="text-xs bg-info text-info-foreground">À commander</Badge>;
    return <Badge variant="secondary" className="text-xs">OK</Badge>;
  };

  const activeCols = useMemo(() => COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)), [visibleCols]);
  const colCtx: ColCtx = { stockBadge };

  const handleExport = () => {
    const cols = activeCols.filter((c) => c.csv).map((c) => ({ key: c.key, label: c.label }));
    const rows = filtered.map((p) => {
      const row: Record<string, any> = {};
      activeCols.forEach((c) => { if (c.csv) row[c.key] = c.csv(p); });
      return row;
    });
    exportToCsv(rows, cols, "pieces_rechange");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pièces de Rechange</h1>
          <p className="text-muted-foreground">{pdrList.length} références</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="h-4 w-4 mr-1" /> Colonnes
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Colonnes affichées</p>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setVisibleCols(defaultVisibleKeys())}>
                  <RotateCcw className="h-3 w-3 mr-1" /> Défaut
                </Button>
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {COLUMN_DEFS.map((c) => (
                  <label key={c.key} className={`flex items-center gap-2 text-sm py-1 ${c.alwaysOn ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                    <Checkbox
                      checked={visibleCols.includes(c.key)}
                      disabled={c.alwaysOn}
                      onCheckedChange={() => toggleCol(c.key)}
                    />
                    {c.label}
                    {c.alwaysOn && <span className="text-[10px] text-muted-foreground ml-auto">requis</span>}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          {canCreate("pdr") && (
            <Button className="h-12 px-6" onClick={() => navigate("/pdr/new")}>
              <Plus className="h-4 w-4 mr-2" /> Ajouter
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiMini icon={Package} label="Total références" value={pdrList.length} />
        <KpiMini icon={AlertCircle} label="Stock critique" value={lowStock} color="bg-destructive/10 text-destructive" />
        <KpiMini icon={ShieldAlert} label="Rupture" value={rupture} color="bg-destructive/10 text-destructive" />
        <KpiMini icon={DollarSign} label="Valeur stock (DA)" value={Math.round(valeurStock).toLocaleString("fr-FR")} color="bg-success/10 text-success" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-11" />
            </div>
            <ListScanButton
              allowedTypes={["pdr"]}
              routeFor={(e) => `/pdr/${e.entity_id}`}
              className="h-11"
            />
            <Select value={filterFamily} onValueChange={setFilterFamily}>
              <SelectTrigger className="h-11 w-[160px]"><SelectValue placeholder="Famille" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes familles</SelectItem>
                {families.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatut} onValueChange={setFilterStatut}>
              <SelectTrigger className="h-11 w-[140px]"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous statuts</SelectItem>
                <SelectItem value="strategique">Stratégique</SelectItem>
                <SelectItem value="commune">Commune</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStock} onValueChange={setFilterStock}>
              <SelectTrigger className="h-11 w-[150px]"><SelectValue placeholder="Stock" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous niveaux</SelectItem>
                <SelectItem value="critique">Stock critique</SelectItem>
                <SelectItem value="rupture">Rupture</SelectItem>
                <SelectItem value="a_commander">À commander</SelectItem>
              </SelectContent>
            </Select>
            {(search.trim() || filterFamily !== "__all__" || filterStatut !== "__all__" || filterStock !== "__all__") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-11 px-3 text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setFilterFamily("__all__");
                  setFilterStatut("__all__");
                  setFilterStock("__all__");
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" /> Réinitialiser
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                {activeCols.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={activeCols.length + 1} className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aucune pièce trouvée
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const img = entityImages.find((i: any) => i.entity_id === p.id);
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pdr/${p.id}`)}>
                      <TableCell className="w-10 pr-0">
                        <EntityThumbnail imageUrl={img?.image_url} alt={p.designation} size="sm" rounded="md" />
                      </TableCell>
                      {activeCols.map((c) => (
                        <TableCell key={c.key} className={c.className}>{c.render(p, colCtx)}</TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
