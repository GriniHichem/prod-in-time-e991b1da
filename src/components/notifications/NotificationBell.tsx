import { useNavigate } from "react-router-dom";
import { Bell, BellRing, CheckCheck, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { useAuth } from "@/contexts/AuthContext";
import { markNotificationRead, markAllNotificationsRead, SEVERITY_BADGE_CLASS } from "@/lib/notifications";
import { cn } from "@/lib/utils";

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { user, roles } = useAuth();
  const { items, count, refetch } = useUnreadNotifications(10);
  const hasCritical = items.some((i) => i.is_critical && i.status === "unread");

  const handleClickItem = async (id: string, status: string, action_url: string | null) => {
    if (status === "unread") await markNotificationRead(id);
    await refetch();
    if (action_url) navigate(action_url);
  };

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.id, roles as string[]);
    await refetch();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-md text-muted-foreground hover:text-foreground relative"
          aria-label="Notifications"
        >
          {hasCritical ? <BellRing size={18} className="text-destructive" /> : <Bell size={18} />}
          {count > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white",
                hasCritical ? "bg-destructive animate-pulse-dot" : "bg-primary"
              )}
            >
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] p-0">
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <Bell size={15} />
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {count} non lue{count > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={handleMarkAll}>
            <CheckCheck size={13} />
            Tout marquer lu
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox size={28} className="opacity-40" />
              Aucune notification
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickItem(n.id, n.status, n.action_url)}
                  className={cn(
                    "w-full text-left p-3 hover:bg-accent/50 transition-colors flex gap-2.5 items-start",
                    n.status === "unread" && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full mt-1.5 shrink-0",
                      n.status === "unread" ? "bg-primary" : "bg-transparent"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold truncate">{n.title}</p>
                      <Badge variant="outline" className={cn("text-[9px] h-4 px-1.5 shrink-0", SEVERITY_BADGE_CLASS[n.severity])}>
                        {n.severity}
                      </Badge>
                    </div>
                    {n.message && (
                      <p className="text-[12px] text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span className="uppercase tracking-wide">{n.module}</span>
                      {n.entity_code && <span>· {n.entity_code}</span>}
                      <span>· {formatRelative(n.created_at)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <Separator />
        <div className="p-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/notifications")}>
            Voir toutes les notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
