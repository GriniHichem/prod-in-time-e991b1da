import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PackageCheck, PackageX, Warehouse, Clock, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePdrRequestQueue, setItemReady, refuseItem, type PdrRequestItem } from "@/hooks/usePdrRequests";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  demandee: { label: "Demandée", cls: "text-amber-600 border-amber-600/40" },
  prete: { label: "Prête", cls: "text-emerald-600 border-emerald-600/40" },
  prise: { label: "Prise", cls: "text-primary border-primary/40" },
  refusee: { label: "Refusée", cls: "text-destructive border-destructive/40" },
  annulee: { label: "Annulée", cls: "text-muted-foreground" },
};

export default function PdrRequestsQueue() {
  const { toast } = useToast();
  const { requests, loading } = usePdrRequestQueue();
  const [readyItem, setReadyItem] = useState<PdrRequestItem | null>(null);
  const [readyQte, setReadyQte] = useState("1");
  const [refuseTarget, setRefuseTarget] = useState<PdrRequestItem | null>(null);
  const [refuseMotif, setRefuseMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const openReady = (it: PdrRequestItem) => { setReadyItem(it); setReadyQte(String(it.quantite_demandee)); };

  const confirmReady = async () => {
    if (!readyItem) return;
    setBusy(true);
    try {
      await setItemReady(readyItem.id, parseInt(readyQte, 10) || readyItem.quantite_demandee);
      toast({ title: "Pièce marquée prête" });
      setReadyItem(null);
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const confirmRefuse = async () => {
    if (!refuseTarget || !refuseMotif.trim()) { toast({ title: "Motif requis", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await refuseItem(refuseTarget.id, refuseMotif.trim());
      toast({ title: "Pièce refusée" });
      setRefuseTarget(null); setRefuseMotif("");
    } catch (e: any) { toast({ title: "Erreur", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement…</div>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Warehouse className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Demandes de pièces</h1>
          <p className="text-xs text-muted-foreground">File temps réel — préparez ou refusez les pièces demandées</p>
        </div>
      </div>

      {requests.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-16 text-center text-muted-foreground">
          <PackageCheck className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Aucune demande en cours</p>
        </CardContent></Card>
      )}

      {requests.map((req) => (
        <Card key={req.id}>
          <CardHeader className="py-3 px-4 border-b border-border/50">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold">{req.numero}</span>
              <Badge variant={req.priorite === "critique" || req.priorite === "haute" ? "destructive" : "secondary"} className="text-[10px]">{req.priorite}</Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{req.type}</Badge>
              {req.tickets && <Badge variant="outline" className="text-[10px] gap-1"><Wrench className="h-3 w-3" />{req.tickets.numero}</Badge>}
              {req.machines && <span className="text-xs text-muted-foreground font-normal">{req.machines.code}</span>}
              <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
                <Clock className="h-3 w-3" />{new Date(req.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </CardTitle>
            {req.commentaire && <p className="text-xs text-muted-foreground mt-1">{req.commentaire}</p>}
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/40">
            {(req.items ?? []).map((it) => {
              const dispo = (it.pdr?.stock_actuel ?? 0) - (it.pdr?.stock_reserve ?? 0);
              const b = STATUS_BADGE[it.statut];
              const actionable = it.statut === "demandee";
              return (
                <div key={it.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-semibold truncate">{it.pdr?.reference}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.pdr?.designation}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Demandé : <strong>{it.quantite_demandee}</strong> · Stock dispo : <strong>{dispo}</strong>
                      {it.refused_reason && <span className="text-destructive"> · {it.refused_reason}</span>}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] ${b?.cls ?? ""}`}>{b?.label ?? it.statut}</Badge>
                  {actionable && (
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-9" onClick={() => openReady(it)}>
                        <PackageCheck className="h-4 w-4 mr-1" /> Prête
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 text-destructive" onClick={() => setRefuseTarget(it)}>
                        <PackageX className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Ready dialog */}
      <Dialog open={!!readyItem} onOpenChange={(o) => !o && setReadyItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Préparer la pièce</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-mono">{readyItem?.pdr?.reference} — {readyItem?.pdr?.designation}</p>
            <div>
              <Label>Quantité préparée</Label>
              <Input type="number" min={1} value={readyQte} onChange={(e) => setReadyQte(e.target.value)} className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReadyItem(null)}>Annuler</Button>
            <Button onClick={confirmReady} disabled={busy}>Marquer prête</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refuse dialog */}
      <Dialog open={!!refuseTarget} onOpenChange={(o) => !o && setRefuseTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refuser la demande</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-mono">{refuseTarget?.pdr?.reference} — {refuseTarget?.pdr?.designation}</p>
            <div>
              <Label>Motif du refus *</Label>
              <Textarea rows={3} value={refuseMotif} onChange={(e) => setRefuseMotif(e.target.value)} placeholder="Rupture de stock, mauvaise référence…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseTarget(null)}>Annuler</Button>
            <Button variant="destructive" onClick={confirmRefuse} disabled={busy}>Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
