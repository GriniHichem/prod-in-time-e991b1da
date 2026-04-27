import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditLogRow } from "@/hooks/useAuditLogs";

interface Props {
  row: AuditLogRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  showTechnical?: boolean;
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

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  machine: (id) => `/machines/${id}`,
  machines: (id) => `/machines/${id}`,
  equipement: (id) => `/equipements/${id}`,
  equipements: (id) => `/equipements/${id}`,
  organe: (id) => `/organes/${id}`,
  organes: (id) => `/organes/${id}`,
  pdr: (id) => `/pdr/${id}`,
  ticket: (id) => `/tickets/${id}`,
  tickets: (id) => `/tickets/${id}`,
  of: (id) => `/gpao/of/${id}`,
  ordre_fabrication: (id) => `/gpao/of/${id}`,
  produit: (id) => `/gpao/produits/${id}`,
  article: (id) => `/gpao/articles/${id}`,
  preventif: (id) => `/preventif/${id}`,
  ligne: (id) => `/lignes/${id}`,
  user: () => `/parametres/users`,
};

function entityLink(row: AuditLogRow): { label: string; to: string } | null {
  if (!row.entity_type || !row.entity_id) return null;
  const fn = ENTITY_ROUTES[row.entity_type.toLowerCase()];
  if (!fn) return null;
  const labelMap: Record<string, string> = {
    machine: "Voir machine", machines: "Voir machine",
    equipement: "Voir équipement", equipements: "Voir équipement",
    organe: "Voir organe", organes: "Voir organe",
    pdr: "Voir PDR",
    ticket: "Voir ticket", tickets: "Voir ticket",
    of: "Voir OF", ordre_fabrication: "Voir OF",
    produit: "Voir produit", article: "Voir article",
    preventif: "Voir préventif", ligne: "Voir ligne",
    user: "Voir utilisateurs",
  };
  return { label: labelMap[row.entity_type.toLowerCase()] ?? "Voir", to: fn(row.entity_id) };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-3 space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </Card>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-[11px] text-muted-foreground font-medium">{k}</span>
      <span className="col-span-2 text-[12px] break-words">{v ?? "—"}</span>
    </div>
  );
}

function DiffTable({ row }: { row: AuditLogRow }) {
  const fields = row.changed_fields ?? [];
  if (fields.length === 0 && !row.old_values && !row.new_values) {
    return <p className="text-xs text-muted-foreground">Aucune modification de valeur.</p>;
  }
  const list = fields.length > 0 ? fields : Array.from(new Set([
    ...Object.keys(row.old_values ?? {}),
    ...Object.keys(row.new_values ?? {}),
  ]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left border-b text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-2">Champ</th>
            <th className="py-1.5 pr-2">Avant</th>
            <th className="py-1.5">Après</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => {
            const a = row.old_values?.[f];
            const b = row.new_values?.[f];
            return (
              <tr key={f} className="border-b border-border/50 align-top">
                <td className="py-1.5 pr-2 font-mono text-[11px]">{f}</td>
                <td className="py-1.5 pr-2 text-[11.5px] text-muted-foreground break-words">
                  <code className="bg-red-500/10 px-1 rounded">{formatVal(a)}</code>
                </td>
                <td className="py-1.5 text-[11.5px] break-words">
                  <code className="bg-emerald-500/10 px-1 rounded">{formatVal(b)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fmtDateLong(s: string) {
  try {
    return new Date(s).toLocaleString("fr-FR", {
      dateStyle: "full", timeStyle: "medium",
    });
  } catch { return s; }
}

export function AuditDetailSheet({ row, open, onOpenChange, showTechnical }: Props) {
  const navigate = useNavigate();
  if (!row) return null;
  const link = entityLink(row);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="space-y-2">
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <span>{row.action_label ?? row.action_type ?? "Événement"}</span>
            <Badge variant="outline" className={cn("text-[10.5px] capitalize", STATUS_STYLES[row.status])}>{row.status}</Badge>
            <Badge variant="outline" className={cn("text-[10.5px] capitalize", SEVERITY_STYLES[row.severity])}>{row.severity}</Badge>
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{fmtDateLong(row.created_at)}</p>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {row.description && (
            <div className="text-sm bg-muted/40 rounded-md p-3 border">
              {row.description}
            </div>
          )}

          {link && (
            <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate(link.to); }} className="gap-2">
              <ExternalLink size={14} /> {link.label}
            </Button>
          )}

          <Tabs defaultValue="general">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="general">Général</TabsTrigger>
              <TabsTrigger value="values">Valeurs</TabsTrigger>
              {showTechnical && <TabsTrigger value="technical">Technique</TabsTrigger>}
              {!showTechnical && <TabsTrigger value="locked" disabled>Technique 🔒</TabsTrigger>}
            </TabsList>

            <TabsContent value="general" className="space-y-3 mt-3">
              <Section title="Utilisateur">
                <KV k="Nom" v={row.user_full_name} />
                <KV k="Email" v={row.user_email} />
                <KV k="ID" v={<span className="font-mono text-[11px]">{row.user_id ?? "—"}</span>} />
              </Section>
              <Section title="Action">
                <KV k="Module" v={<Badge variant="outline">{row.module ?? "—"}</Badge>} />
                <KV k="Type" v={row.action_type} />
                <KV k="Libellé" v={row.action_label} />
                <KV k="Source" v={row.source} />
              </Section>
              <Section title="Entité">
                <KV k="Type" v={row.entity_type} />
                <KV k="Code" v={row.entity_code} />
                <KV k="Libellé" v={row.entity_label} />
                <KV k="ID" v={<span className="font-mono text-[11px]">{row.entity_id ?? "—"}</span>} />
              </Section>
            </TabsContent>

            <TabsContent value="values" className="space-y-3 mt-3">
              <Section title="Champs modifiés">
                <DiffTable row={row} />
              </Section>
            </TabsContent>

            {showTechnical && (
              <TabsContent value="technical" className="space-y-3 mt-3">
                <Section title="Réseau">
                  <KV k="IP" v={<span className="font-mono">{row.ip_address ?? "—"}</span>} />
                  <KV k="User Agent" v={<span className="text-[10.5px] break-all">{row.user_agent ?? "—"}</span>} />
                </Section>
                <Section title="Métadonnées">
                  <pre className="text-[10.5px] bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(row.metadata ?? {}, null, 2)}
                  </pre>
                </Section>
                <Section title="JSON brut — old_values">
                  <pre className="text-[10.5px] bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(row.old_values ?? {}, null, 2)}
                  </pre>
                </Section>
                <Section title="JSON brut — new_values">
                  <pre className="text-[10.5px] bg-muted/40 rounded p-2 overflow-x-auto">
                    {JSON.stringify(row.new_values ?? {}, null, 2)}
                  </pre>
                </Section>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
