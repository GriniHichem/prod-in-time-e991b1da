import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuditLogs, useAuditKpis, fetchAllAuditLogs, type AuditFilters, type AuditLogRow } from "@/hooks/useAuditLogs";
import { downloadCsv } from "@/lib/auditExport";
import { logAudit } from "@/lib/audit";
import { AuditKpiCards, type KpiPreset } from "@/components/audit/AuditKpiCards";
import { AuditFilters as AuditFiltersBar } from "@/components/audit/AuditFilters";
import { AuditQuickChips, applyQuickPreset, type QuickPreset } from "@/components/audit/AuditQuickChips";
import { AuditTable } from "@/components/audit/AuditTable";
import { AuditDetailSheet } from "@/components/audit/AuditDetailSheet";

const PAGE_SIZE = 50;

const EMPTY_FILTERS: AuditFilters = {};

export default function AuditPage() {
  const navigate = useNavigate();
  const { hasRole, loading: authLoading } = useAuth();
  const { canView, canCreate, canEdit, canDelete, loading: permsLoading } = usePermissions();

  const isAdmin = hasRole("admin");
  // mapping: view=can_view ; export=can_create ; technical_details=can_edit ; archive=can_delete
  const canExport = canCreate("audit") || isAdmin;
  const canSeeTechnical = canEdit("audit") || isAdmin;
  const canSeeArchives = canDelete("audit") || isAdmin;

  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [activePreset, setActivePreset] = useState<QuickPreset | null>(null);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exportTechnical, setExportTechnical] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { rows, count, loading, error } = useAuditLogs({ filters, page, pageSize: PAGE_SIZE });
  const { kpis, loading: kpisLoading } = useAuditKpis(page); // refresh keyed loosely

  const access = useMemo(() => canView("audit") || isAdmin, [canView, isAdmin]);

  // Auth/permission guard
  if (!authLoading && !permsLoading && !access) {
    return (
      <Card className="p-10 text-center max-w-lg mx-auto mt-12">
        <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-bold mb-1">Accès restreint</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Le module Audit & Traçabilité est réservé aux rôles autorisés (admin, responsable SI, auditeur, responsable maintenance/production).
        </p>
        <Button onClick={() => navigate("/")} variant="outline">Retour au tableau de bord</Button>
      </Card>
    );
  }

  const updateFilters = (next: AuditFilters) => {
    setFilters(next);
    setPage(0);
    setActivePreset(null);
  };
  const reset = () => updateFilters(EMPTY_FILTERS);

  const handleQuickPreset = (preset: QuickPreset) => {
    const isToggleOff = activePreset === preset;
    if (isToggleOff) { reset(); return; }
    setFilters(applyQuickPreset(preset, EMPTY_FILTERS));
    setActivePreset(preset);
    setPage(0);
  };

  const handleKpiClick = (preset: KpiPreset) => {
    const map: Record<KpiPreset, () => AuditFilters> = {
      today:        () => applyQuickPreset("today", EMPTY_FILTERS),
      critical:     () => ({ severity: "critical" }),
      denied:       () => ({ status: "denied" }),
      errors:       () => ({ actionType: "error" }),
      logins_today: () => ({ ...applyQuickPreset("today", EMPTY_FILTERS), actionType: "login" }),
      sensitive:    () => ({ ...applyQuickPreset("today", EMPTY_FILTERS), actionType: "role_change" }),
      pdr_stock:    () => ({ ...applyQuickPreset("today", EMPTY_FILTERS), module: "pdr_stock" }),
    };
    setFilters(map[preset]());
    setPage(0);
    setActivePreset(null);
  };

  const handleSelectRow = (r: AuditLogRow) => {
    setSelected(r);
    setSheetOpen(true);
  };

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const all = await fetchAllAuditLogs(filters);
      downloadCsv(all, exportTechnical && isAdmin);
      toast.success(`${all.length.toLocaleString("fr-FR")} événements exportés.`);
      logAudit({
        action_type: "export_csv",
        module: "audit",
        entity_type: "audit_logs",
        action_label: "Export journaux d'audit",
        description: `Export CSV de ${all.length} entrées d'audit`,
        metadata: { filters, includeTechnical: exportTechnical && isAdmin, count: all.length },
        severity: "medium",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast.error(`Export impossible : ${msg}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit & Traçabilité</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Journal complet des actions importantes : authentification, modifications, mouvements stock, corrections, sécurité.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && isAdmin && (
            <div className="flex items-center gap-1.5 mr-1">
              <Checkbox id="tech-export" checked={exportTechnical} onCheckedChange={(v) => setExportTechnical(!!v)} />
              <Label htmlFor="tech-export" className="text-xs cursor-pointer">Inclure JSON technique</Label>
            </div>
          )}
          <Button onClick={handleExport} disabled={!canExport || exporting} className="gap-2">
            <Download size={15} />
            {exporting ? "Export..." : "Exporter CSV"}
          </Button>
        </div>
      </div>

      {/* KPI */}
      <AuditKpiCards kpis={kpis} loading={kpisLoading} onChipClick={handleKpiClick} />

      {/* Quick filters */}
      <AuditQuickChips active={activePreset} onSelect={handleQuickPreset} />

      {/* Advanced filters */}
      <AuditFiltersBar
        filters={filters}
        onChange={updateFilters}
        onReset={reset}
        canViewArchives={canSeeArchives}
      />

      {error && (
        <Card className="p-4 border-destructive/50 bg-destructive/5 text-sm text-destructive">
          Erreur de chargement : {error}
        </Card>
      )}

      {/* Table */}
      <AuditTable
        rows={rows}
        count={count}
        loading={loading}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onSelectRow={handleSelectRow}
      />

      {/* Detail sheet */}
      <AuditDetailSheet
        row={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        showTechnical={canSeeTechnical}
      />
    </div>
  );
}
