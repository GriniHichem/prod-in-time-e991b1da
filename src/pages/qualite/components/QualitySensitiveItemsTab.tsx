import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";
import { BOM_ITEM_TYPE_LABELS, BomItemType } from "./BomHelpers";

export default function QualitySensitiveItemsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [i, b] = await Promise.all([
        (supabase as any).from("bom_items").select("*, articles(code, designation)").eq("is_quality_sensitive", true),
        (supabase as any).from("bill_of_materials").select("id, version, status, products(code, designation)"),
      ]);
      setItems(i.data || []);
      setBoms(b.data || []);
    })();
  }, []);

  const filtered = items.filter((it) => {
    if (!search) return true;
    const bom = boms.find((b) => b.id === it.bom_id);
    const hay = `${it.articles?.code} ${it.articles?.designation} ${bom?.products?.code} ${bom?.products?.designation}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3">
          <Input placeholder="Recherche article / produit…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-12 max-w-xs" />
        </CardContent>
      </Card>
      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Aucun article qualité sensible</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left p-2">Article</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Produit</th>
                <th className="text-left p-2">Nomenclature</th>
                <th className="text-right p-2">Qté</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const bom = boms.find((b) => b.id === it.bom_id);
                return (
                  <tr key={it.id} className="border-t">
                    <td className="p-2 flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                      <span className="font-medium">{it.articles?.code}</span>
                      <span className="text-muted-foreground">{it.articles?.designation}</span>
                    </td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{BOM_ITEM_TYPE_LABELS[it.item_type as BomItemType]}</Badge></td>
                    <td className="p-2">{bom?.products?.code} — {bom?.products?.designation}</td>
                    <td className="p-2">v{bom?.version} <Badge variant="outline" className="text-[9px] ml-1">{bom?.status}</Badge></td>
                    <td className="p-2 text-right tabular-nums">{it.quantity_per_unit} {it.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
