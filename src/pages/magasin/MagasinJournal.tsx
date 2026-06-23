import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, Search, RotateCcw } from "lucide-react";
import { ExportCsvButton } from "@/components/common/ExportCsvButton";
import { useMagasinActivity, type MagasinMovement } from "@/hooks/useMagasinActivity";

const TYPE_LABEL: Record<string, string> = { entree: "Entrée", sortie: "Sortie", correction: "Correction", inventaire: "Inventaire" };
const TYPE_CLS: Record<string, string> = {
  entree: "text-emerald-600 border-emerald-600/40",
  sortie: "text-destructive border-destructive/40",
  correction: "text-amber-600 border-amber-600/40",
  inventaire: "text-sky-600 border-sky-600/40",
};

function withinPeriod(dateStr: string, period: string) {
  if (period === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "today") return d.toDateString() === now.toDateString();
  const days = period === "7d" ? 7 : 30;
  return +now - +d <= days * 86400000;
}

export default function MagasinJournal() {
  const { movements, loading } = useMagasinActivity(500);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [period, setPeriod] = useState("all");

  const agents = useMemo(
    () => [...new Set(movements.map((m) => m.agent_name).filter(Boolean))] as string[],
    [movements],
  );

  const filtersActive = search.trim() !== "" || typeFilter !== "all" || agentFilter !== "all" || period !== "all";
  const reset = () => { setSearch(""); setTypeFilter("all"); setAgentFilter("all"); setPeriod("all"); };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return movements.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (agentFilter !== "all" && m.agent_name !== agentFilter) return false;
      if (!withinPeriod(m.created_at, period)) return false;
      if (q) {
        const hay = [m.pdr?.reference, m.pdr?.designation, m.ticket_numero, m.reference_source, m.agent_name, m.motif]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movements, search, typeFilter, agentFilter, period]);

  const csvColumns = [
    { key: "created_at", label: "Date", format: (v: string) => new Date(v).toLocaleString("fr-FR") },
    { key: "type", label: "Type", format: (v: string) => TYPE_LABEL[v] ?? v },
    { key: "pdr", label: "Référence", format: (_: any, r: MagasinMovement) => r.pdr?.reference ?? "" },
    { key: "designation", label: "Désignation", format: (_: any, r: MagasinMovement) => r.pdr?.designation ?? "" },
    { key: "quantite", label: "Quantité" },
    { key: "stock_avant", label: "Stock avant", format: (v: number | null) => (v ?? "") + "" },
    { key: "stock_apres", label: "Stock après", format: (v: number | null) => (v ?? "") + "" },
    { key: "agent_name", label: "Magasinier", format: (v: string) => v ?? "" },
    { key: "ticket_numero", label: "Ticket", format: (v: string) => v ?? "" },
    { key: "reference_source", label: "Réf. source", format: (v: string) => v ?? "" },
    { key: "motif", label: "Motif", format: (v: string) => v ?? "" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Journal Stock</h1>
          <p className="text-xs text-muted-foreground">Historique complet des mouvements de stock — entrées, sorties, corrections et inventaire</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher : pièce, ticket, magasinier, motif…" className="h-11 pl-9" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous mouvements</SelectItem>
                <SelectItem value="entree">Entrées</SelectItem>
                <SelectItem value="sortie">Sorties</SelectItem>
                <SelectItem value="correction">Corrections</SelectItem>
                <SelectItem value="inventaire">Inventaire</SelectItem>
              </SelectContent>
            </Select>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Magasinier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous magasiniers</SelectItem>
                {agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Période" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute période</SelectItem>
                <SelectItem value="today">Aujourd'hui</SelectItem>
                <SelectItem value="7d">7 derniers jours</SelectItem>
                <SelectItem value="30d">30 derniers jours</SelectItem>
              </SelectContent>
            </Select>
            <ExportCsvButton data={filtered} columns={csvColumns} filename="journal-stock" className="h-11" />
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Réinitialiser
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm">Mouvements ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Pièce</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead className="text-right">Avant</TableHead>
                <TableHead className="text-right">Après</TableHead>
                <TableHead>Magasinier</TableHead>
                <TableHead>Ticket / Source</TableHead>
                <TableHead>Motif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Aucun mouvement</TableCell></TableRow>
              ) : filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${TYPE_CLS[m.type] ?? ""}`}>{TYPE_LABEL[m.type] ?? m.type}</Badge></TableCell>
                  <TableCell>
                    <p className="font-mono text-xs font-semibold">{m.pdr?.reference}</p>
                    <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{m.pdr?.designation}</p>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${m.type === "sortie" ? "text-destructive" : ""}`}>
                    {m.type === "sortie" ? "-" : "+"}{m.quantite}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{m.stock_avant ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{m.stock_apres ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.agent_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.ticket_numero ?? m.reference_source ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{m.motif ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
