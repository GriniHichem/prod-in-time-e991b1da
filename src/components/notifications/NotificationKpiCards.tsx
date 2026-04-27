import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Bell, BellRing, ShieldAlert, Calendar, PackageMinus, Wrench, Factory, Shield, type LucideIcon } from "lucide-react";

export interface NotifKpis {
  total: number;
  unread: number;
  critical: number;
  today: number;
  pdr: number;
  maintenance: number;
  production: number;
  security: number;
}

const ITEMS: Array<{ key: keyof NotifKpis; label: string; icon: LucideIcon; accent: string }> = [
  { key: "total",       label: "Total",         icon: Bell,         accent: "text-foreground" },
  { key: "unread",      label: "Non lues",      icon: BellRing,     accent: "text-primary" },
  { key: "critical",    label: "Critiques",     icon: ShieldAlert,  accent: "text-rose-500" },
  { key: "today",       label: "Aujourd'hui",   icon: Calendar,     accent: "text-sky-500" },
  { key: "pdr",         label: "Stock PDR",     icon: PackageMinus, accent: "text-violet-500" },
  { key: "maintenance", label: "Maintenance",   icon: Wrench,       accent: "text-amber-500" },
  { key: "production",  label: "Production",    icon: Factory,      accent: "text-emerald-500" },
  { key: "security",    label: "Sécurité",      icon: Shield,       accent: "text-orange-500" },
];

export function NotificationKpiCards({ kpis }: { kpis: NotifKpis }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {ITEMS.map(({ key, label, icon: Icon, accent }) => (
        <Card key={key} className="p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
            <Icon size={14} className={cn("opacity-70", accent)} />
          </div>
          <div className={cn("text-2xl font-bold tabular-nums", accent)}>{kpis[key]}</div>
        </Card>
      ))}
    </div>
  );
}
