import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditLogRow } from "@/hooks/useAuditLogs";

interface Props {
  rows: AuditLogRow[];
  count: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onSelectRow: (row: AuditLogRow) => void;
}

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  failed:  "bg-red-500/15 text-red-700 border-red-500/30",
  denied:  "bg-orange-500/15 text-orange-700 border-orange-500/30",
  warning: "bg-amber-500/15 text-amber-700 border-amber-500/30",
};

const SEVERITY_STYLES: Record<string, string> = {
  info:     "bg-blue-500/10 text-blue-700 border-blue-500/30",
  low:      "bg-slate-500/10 text-slate-700 border-slate-500/30",
  medium:   "bg-amber-500/15 text-amber-700 border-amber-500/30",
  high:     "bg-orange-500/15 text-orange-700 border-orange-500/30",
  critical: "bg-red-600/20 text-red-800 border-red-600/40 font-bold",
};

function fmtDate(s: string) {
  try {
    const d = new Date(s);
    return d.toLocaleString("fr-FR", {
      year: "2-digit", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return s; }
}

export function AuditTable({ rows, count, loading, page, pageSize, onPageChange, onSelectRow }: Props) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min(count, (page + 1) * pageSize);

  const skeletonRows = useMemo(() => Array.from({ length: 8 }), []);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5">Utilisateur</th>
              <th className="px-3 py-2.5">Module</th>
              <th className="px-3 py-2.5">Action</th>
              <th className="px-3 py-2.5">Entité</th>
              <th className="px-3 py-2.5 min-w-[260px]">Description</th>
              <th className="px-3 py-2.5">Statut</th>
              <th className="px-3 py-2.5">Sévérité</th>
              <th className="px-3 py-2.5">IP</th>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5 text-right">Détails</th>
            </tr>
          </thead>
          <tbody>
            {loading && skeletonRows.map((_, i) => (
              <tr key={`sk-${i}`} className="border-b">
                {Array.from({ length: 11 }).map((__, j) => (
                  <td key={j} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-12 text-center text-muted-foreground">
                  Aucun événement trouvé pour ces filtres.
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "border-b hover:bg-accent/40 transition-colors",
                  r.severity === "critical" && "bg-red-500/5",
                  r.status === "denied" && "bg-orange-500/5",
                )}
              >
                <td className="px-3 py-2 whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">{fmtDate(r.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12.5px] font-medium">{r.user_full_name ?? "—"}</span>
                    <span className="text-[10.5px] text-muted-foreground">{r.user_email ?? ""}</span>
                  </div>
                </td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-[10.5px] font-semibold">{r.module ?? "—"}</Badge></td>
                <td className="px-3 py-2 text-[12px] font-medium">{r.action_label ?? r.action_type ?? r.action ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[11.5px] text-muted-foreground">{r.entity_type ?? ""}</span>
                    <span className="text-[12px] font-mono">{r.entity_code ?? r.entity_id?.slice(0,8) ?? ""}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-[12px] max-w-[420px]">
                  <span className="line-clamp-2">{r.description ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={cn("text-[10.5px] font-semibold capitalize", STATUS_STYLES[r.status])}>
                    {r.status}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={cn("text-[10.5px] font-semibold capitalize", SEVERITY_STYLES[r.severity])}>
                    {r.severity}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-[11px] font-mono text-muted-foreground">{r.ip_address ?? "—"}</td>
                <td className="px-3 py-2 text-[11px] text-muted-foreground">{r.source}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => onSelectRow(r)} className="h-7 px-2">
                    <Eye size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs">
        <div className="text-muted-foreground">
          {count === 0 ? "0 événement" : <>Affichage {start.toLocaleString("fr-FR")} – {end.toLocaleString("fr-FR")} sur {count.toLocaleString("fr-FR")}</>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0} className="h-7 px-2">
            <ChevronLeft size={14} />
          </Button>
          <span className="text-xs px-2">Page {page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="h-7 px-2">
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
