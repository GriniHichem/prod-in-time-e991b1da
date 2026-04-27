import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Archive, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { NotificationRow } from "@/hooks/useNotifications";
import { SEVERITY_BADGE_CLASS, markNotificationRead, archiveNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

interface Props {
  notification: NotificationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export function NotificationDetailSheet({ notification, open, onOpenChange, onRefresh }: Props) {
  const navigate = useNavigate();
  if (!notification) return null;
  const n = notification;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{n.title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", SEVERITY_BADGE_CLASS[n.severity])}>{n.severity}</Badge>
            <Badge variant="outline" className="text-[10px]">{n.status}</Badge>
            <Badge variant="outline" className="text-[10px]">{n.module}</Badge>
            <Badge variant="outline" className="text-[10px]">{n.notification_type}</Badge>
            {n.is_critical && <Badge variant="destructive" className="text-[10px]">Critique</Badge>}
          </div>
          {n.message && <p className="text-sm whitespace-pre-wrap">{n.message}</p>}
          <Separator />
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Source</dt><dd>{n.source}</dd>
            <dt className="text-muted-foreground">Créée le</dt><dd>{new Date(n.created_at).toLocaleString()}</dd>
            {n.read_at && (<><dt className="text-muted-foreground">Lue le</dt><dd>{new Date(n.read_at).toLocaleString()}</dd></>)}
            {n.entity_type && (<><dt className="text-muted-foreground">Entité</dt><dd>{n.entity_type} {n.entity_code ?? ""}</dd></>)}
            {n.entity_label && (<><dt className="text-muted-foreground">Libellé</dt><dd>{n.entity_label}</dd></>)}
            {n.recipient_role && (<><dt className="text-muted-foreground">Rôle dest.</dt><dd>{n.recipient_role}</dd></>)}
          </dl>
          {n.metadata && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Metadata</p>
                <pre className="text-[11px] bg-muted/40 p-2 rounded max-h-48 overflow-auto">
                  {JSON.stringify(n.metadata, null, 2)}
                </pre>
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {n.action_url && (
              <Button size="sm" onClick={() => { navigate(n.action_url!); onOpenChange(false); }}>
                <ExternalLink size={14} /> Ouvrir l'entité
              </Button>
            )}
            {n.status === "unread" && (
              <Button size="sm" variant="outline" onClick={async () => { await markNotificationRead(n.id); onRefresh(); }}>
                <Check size={14} /> Marquer lu
              </Button>
            )}
            {n.status !== "archived" && (
              <Button size="sm" variant="outline" onClick={async () => { await archiveNotification(n.id); onRefresh(); onOpenChange(false); }}>
                <Archive size={14} /> Archiver
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
