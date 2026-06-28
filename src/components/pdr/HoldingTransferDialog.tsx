import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Warehouse } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { MaintenanceHolding } from "@/hooks/useMaintenanceHoldings";
import {
  initiateHoldingTransfer,
  useTransferRecipients,
  type TransferDestination,
} from "@/hooks/usePdrHoldingTransfers";

interface Props {
  holding: MaintenanceHolding | null;
  mode: TransferDestination | null; // "maintainer" = passer à un collègue ; "magasin" = retour
  onClose: () => void;
  onDone?: () => void;
}

export function HoldingTransferDialog({ holding, mode, onClose, onDone }: Props) {
  const { toast } = useToast();
  const recipients = useTransferRecipients();
  const [qte, setQte] = useState("1");
  const [toHolder, setToHolder] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (holding) { setQte(String(holding.quantite)); setToHolder(""); setMotif(""); }
  }, [holding]);

  const open = !!holding && !!mode;
  const isReturn = mode === "magasin";
  const maxQte = holding?.quantite ?? 0;

  const submit = async () => {
    if (!holding || !mode) return;
    const n = parseInt(qte, 10);
    if (!n || n < 1 || n > maxQte) { toast({ title: "Quantité invalide", variant: "destructive" }); return; }
    if (mode === "maintainer" && !toHolder) { toast({ title: "Choisissez un destinataire", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await initiateHoldingTransfer({
        holdingId: holding.id,
        qte: n,
        destination: mode,
        toHolder: mode === "maintainer" ? toHolder : null,
        motif: motif.trim() || null,
      });
      toast({
        title: isReturn ? "Retour envoyé au magasin" : "Transfert envoyé",
        description: "En attente de confirmation de réception.",
      });
      onDone?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReturn ? <Warehouse className="h-5 w-5 text-primary" /> : <ArrowRightLeft className="h-5 w-5 text-primary" />}
            {isReturn ? "Retour au magasin" : "Passer la pièce"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border/60 p-3">
            <p className="font-mono text-sm font-semibold">{holding?.pdr?.reference}</p>
            <p className="text-xs text-muted-foreground">{holding?.pdr?.designation}</p>
            <p className="text-[11px] text-muted-foreground mt-1">En stock maintenance : <strong>{maxQte}</strong></p>
          </div>

          {!isReturn && (
            <div>
              <Label>Destinataire *</Label>
              <Select value={toHolder} onValueChange={setToHolder}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Choisir un maintenancier / responsable" /></SelectTrigger>
                <SelectContent>
                  {recipients.map((r) => (
                    <SelectItem key={r.user_id} value={r.user_id}>{r.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Quantité</Label>
            <Input type="number" min={1} max={maxQte} value={qte} onChange={(e) => setQte(e.target.value)} className="h-11" />
          </div>

          <div>
            <Label>Motif (optionnel)</Label>
            <Textarea rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={isReturn ? "Pièce non utilisée, reliquat…" : "Aide intervention, mutualisation…"} />
          </div>

          <p className="text-xs text-muted-foreground">
            La pièce est réservée immédiatement et reste bloquée jusqu'à la confirmation
            {isReturn ? " du magasin." : " du destinataire."} Vous pouvez annuler tant que ce n'est pas confirmé.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>
            {isReturn ? "Envoyer le retour" : "Envoyer le transfert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
