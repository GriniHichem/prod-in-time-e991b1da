import { useState, useCallback } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, FileUp, CheckCircle, AlertCircle, X, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface CsvField {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "boolean";
}

interface CsvImporterProps {
  tableName: string;
  fields: CsvField[];
  uniqueKey: string;
  onComplete: () => void;
  triggerLabel?: string;
}

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

interface RowError {
  row: number;
  field: string;
  message: string;
}

export function CsvImporter({ tableName, fields, uniqueKey, onComplete, triggerLabel = "Import CSV" }: CsvImporterProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<RowError[]>([]);
  const [importResult, setImportResult] = useState({ created: 0, updated: 0, errors: 0 });

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setErrors([]);
    setImportResult({ created: 0, updated: 0, errors: 0 });
  };

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields || [];
        setCsvHeaders(headers);
        setCsvRows(result.data as Record<string, string>[]);
        // Auto-map matching headers
        const autoMap: Record<string, string> = {};
        fields.forEach((f) => {
          const match = headers.find((h) => h.toLowerCase().trim() === f.key.toLowerCase() || h.toLowerCase().trim() === f.label.toLowerCase());
          if (match) autoMap[f.key] = match;
        });
        setMapping(autoMap);
        setStep("mapping");
      },
      error: () => toast({ title: "Erreur de lecture du fichier", variant: "destructive" }),
    });
  }, [fields, toast]);

  const validate = () => {
    const errs: RowError[] = [];
    csvRows.forEach((row, i) => {
      fields.forEach((f) => {
        const csvCol = mapping[f.key];
        const val = csvCol ? row[csvCol]?.trim() : "";
        if (f.required && !val) {
          errs.push({ row: i + 1, field: f.label, message: "Requis" });
        }
        if (f.type === "number" && val && isNaN(Number(val))) {
          errs.push({ row: i + 1, field: f.label, message: "Nombre invalide" });
        }
      });
    });
    setErrors(errs);
    if (errs.length === 0) setStep("preview");
    else toast({ title: `${errs.length} erreur(s) détectée(s)`, description: "Corrigez le fichier ou le mapping", variant: "destructive" });
  };

  const getMappedRows = () => {
    return csvRows.map((row) => {
      const obj: Record<string, any> = {};
      fields.forEach((f) => {
        const csvCol = mapping[f.key];
        const val = csvCol ? row[csvCol]?.trim() : "";
        if (!val) return;
        if (f.type === "number") obj[f.key] = Number(val);
        else if (f.type === "boolean") obj[f.key] = val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "oui";
        else obj[f.key] = val;
      });
      return obj;
    }).filter((r) => Object.keys(r).length > 0 && r[uniqueKey]);
  };

  const doImport = async () => {
    setStep("importing");
    const rows = getMappedRows();
    let created = 0, updated = 0, errCount = 0;

    // Batch upsert
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from(tableName as any).upsert(batch as any, { onConflict: uniqueKey });
      if (error) {
        errCount += batch.length;
        console.error("Upsert error:", error);
      } else {
        // Approximate: we can't distinguish created vs updated with upsert
        created += batch.length;
      }
    }

    setImportResult({ created, updated, errors: errCount });
    setStep("done");
    if (errCount === 0) {
      toast({ title: `${created} enregistrement(s) importé(s)` });
      onComplete();
    } else {
      toast({ title: `Import partiel: ${errCount} erreur(s)`, variant: "destructive" });
    }
  };

  const previewRows = getMappedRows().slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-1" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Import CSV — {tableName === "products" ? "Produits" : "Articles"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
          {(["upload", "mapping", "preview", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="h-3 w-3" />}
              <Badge variant={step === s ? "default" : "outline"} className="text-[10px]">
                {s === "upload" ? "Fichier" : s === "mapping" ? "Mapping" : s === "preview" ? "Aperçu" : "Terminé"}
              </Badge>
            </div>
          ))}
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">Glissez un fichier CSV ou cliquez pour sélectionner</p>
              <Input type="file" accept=".csv,.txt" onChange={handleFile} className="max-w-xs mx-auto" />
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Champs attendus :</p>
              <div className="flex flex-wrap gap-1">
                {fields.map((f) => (
                  <Badge key={f.key} variant={f.required ? "default" : "outline"} className="text-[10px]">
                    {f.label} {f.required && "*"}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{csvRows.length} lignes détectées · {csvHeaders.length} colonnes</p>
            <div className="grid gap-3">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <Label className="w-40 text-sm shrink-0">
                    {f.label} {f.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Select value={mapping[f.key] || "__none__"} onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="— Ignorer —" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Ignorer —</SelectItem>
                      {csvHeaders.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {errors.length > 0 && (
              <Card className="border-destructive/30">
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-destructive mb-2">{errors.length} erreur(s)</p>
                  <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                    {errors.slice(0, 20).map((e, i) => (
                      <p key={i} className="text-destructive">Ligne {e.row} · {e.field}: {e.message}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>Annuler</Button>
              <Button onClick={validate}>Valider le mapping</Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Aperçu des {Math.min(10, previewRows.length)} premières lignes sur {getMappedRows().length} au total</p>
            <div className="border rounded-lg overflow-auto max-h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {fields.filter((f) => mapping[f.key]).map((f) => (
                      <TableHead key={f.key} className="text-xs whitespace-nowrap">{f.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      {fields.filter((f) => mapping[f.key]).map((f) => (
                        <TableCell key={f.key} className="text-xs py-2">{String(r[f.key] ?? "—")}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("mapping")}>Retour</Button>
              <Button onClick={doImport}>
                <CheckCircle className="h-4 w-4 mr-1" /> Importer {getMappedRows().length} ligne(s)
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-12 text-center">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Import en cours...</p>
          </div>
        )}

        {step === "done" && (
          <div className="py-8 text-center space-y-3">
            {importResult.errors === 0 ? (
              <CheckCircle className="h-12 w-12 text-success mx-auto" />
            ) : (
              <AlertCircle className="h-12 w-12 text-warning mx-auto" />
            )}
            <p className="text-lg font-medium">{importResult.created} enregistrement(s) traité(s)</p>
            {importResult.errors > 0 && <p className="text-sm text-destructive">{importResult.errors} erreur(s)</p>}
            <Button onClick={() => { setOpen(false); reset(); }}>Fermer</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
