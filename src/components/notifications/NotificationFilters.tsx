import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { RotateCcw, Search } from "lucide-react";
import type { NotificationFilters } from "@/hooks/useNotifications";

const NONE = "__none__";

const MODULES = [
  "auth","users","roles","permissions","machines","equipements","organes","lignes",
  "pdr","pdr_stock","tickets","interventions","preventif","gpao","of","produits",
  "articles","recettes","consommations","arrets","documents","images","parametres","audit","system","notifications",
];

const STATUSES: Array<{ v: NotificationFilters["status"]; label: string }> = [
  { v: "all", label: "Tous" },
  { v: "unread", label: "Non lu" },
  { v: "read", label: "Lu" },
  { v: "archived", label: "Archivé" },
];
const SEVERITIES = ["info","low","medium","high","critical"];

interface Props {
  filters: NotificationFilters;
  onChange: (f: NotificationFilters) => void;
  onReset: () => void;
}

export function NotificationFiltersBar({ filters, onChange, onReset }: Props) {
  const hasActive =
    !!filters.search || !!filters.module || !!filters.notification_type ||
    !!filters.severity || !!filters.entity_code || !!filters.dateFrom || !!filters.dateTo ||
    (filters.status && filters.status !== "all");

  return (
    <Card className="p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-[11px] text-muted-foreground">Recherche</Label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              className="pl-8 h-9"
              placeholder="Titre, message, entité…"
              value={filters.search ?? ""}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Statut</Label>
          <Select value={filters.status ?? "all"} onValueChange={(v) => onChange({ ...filters, status: v as NotificationFilters["status"] })}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.v} value={s.v as string}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Module</Label>
          <Select value={filters.module ?? NONE} onValueChange={(v) => onChange({ ...filters, module: v === NONE ? undefined : v })}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Tous" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Tous</SelectItem>
              {MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Sévérité</Label>
          <Select value={filters.severity ?? NONE} onValueChange={(v) => onChange({ ...filters, severity: v === NONE ? undefined : v })}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Toutes</SelectItem>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Type</Label>
          <Input
            className="h-9 w-[180px]"
            placeholder="ex: ticket_created"
            value={filters.notification_type ?? ""}
            onChange={(e) => onChange({ ...filters, notification_type: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Entité</Label>
          <Input
            className="h-9 w-[140px]"
            placeholder="Code"
            value={filters.entity_code ?? ""}
            onChange={(e) => onChange({ ...filters, entity_code: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Du</Label>
          <Input type="date" className="h-9 w-[150px]" value={filters.dateFrom ?? ""} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || undefined })} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Au</Label>
          <Input type="date" className="h-9 w-[150px]" value={filters.dateTo ?? ""} onChange={(e) => onChange({ ...filters, dateTo: e.target.value || undefined })} />
        </div>
        {hasActive && (
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onReset}>
            <RotateCcw size={14} />
            Réinitialiser
          </Button>
        )}
      </div>
    </Card>
  );
}
