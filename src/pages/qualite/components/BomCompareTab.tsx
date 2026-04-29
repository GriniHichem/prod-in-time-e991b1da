import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BOM_ITEM_TYPE_LABELS, BomItemType } from "./BomHelpers";

export default function BomCompareTab() {
  const [boms, setBoms] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [b, i] = await Promise.all([
        (supabase as any).from("bill_of_materials").select("*, products(code, designation)").order("version", { ascending: false }),
        (supabase as any).from("bom_items").select("*, articles(code, designation)"),
      ]);
      setBoms(b.data || []);
      setItems(i.data || []);
    })();
  }, []);

  const products = useMemo(() => {
    const m = new Map<string, any>();
    for (const b of boms) if (!m.has(b.product_id)) m.set(b.product_id, b.products);
    return Array.from(m.entries()).map(([id, p]) => ({ id, ...p }));
  }, [boms]);

  const versions = useMemo(() => boms.filter((b) => b.product_id === productId), [boms, productId]);

  const itemsA = items.filter((i) => i.bom_id === aId);
  const itemsB = items.filter((i) => i.bom_id === bId);

  const keys = new Set<string>();
  itemsA.forEach((i) => keys.add(i.article_id + "|" + i.item_type));
  itemsB.forEach((i) => keys.add(i.article_id + "|" + i.item_type));

  const rows = Array.from(keys).map((k) => {
    const a = itemsA.find((i) => i.article_id + "|" + i.item_type === k);
    const b = itemsB.find((i) => i.article_id + "|" + i.item_type === k);
    return { k, a, b, art: (a || b)?.articles, type: (a || b)?.item_type as BomItemType };
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <Select value={productId} onValueChange={(v) => { setProductId(v); setAId(""); setBId(""); }}>
            <SelectTrigger className="h-12 w-72"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.designation}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={aId} onValueChange={setAId} disabled={!productId}>
            <SelectTrigger className="h-12 w-44"><SelectValue placeholder="Version A" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => <SelectItem key={v.id} value={v.id}>v{v.version} ({v.status})</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bId} onValueChange={setBId} disabled={!productId}>
            <SelectTrigger className="h-12 w-44"><SelectValue placeholder="Version B" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => <SelectItem key={v.id} value={v.id}>v{v.version} ({v.status})</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!aId || !bId ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Sélectionnez deux versions à comparer</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left p-2">Article</th>
                <th className="text-left p-2">Type</th>
                <th className="text-right p-2">A</th>
                <th className="text-right p-2">B</th>
                <th className="text-left p-2">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const aQ = r.a?.quantity_per_unit ?? null;
                const bQ = r.b?.quantity_per_unit ?? null;
                const diff = aQ != null && bQ != null ? bQ - aQ : null;
                return (
                  <tr key={r.k} className="border-t">
                    <td className="p-2">{r.art?.code} — {r.art?.designation}</td>
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{BOM_ITEM_TYPE_LABELS[r.type]}</Badge></td>
                    <td className="p-2 text-right tabular-nums">{aQ != null ? `${aQ} ${r.a?.unit}` : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{bQ != null ? `${bQ} ${r.b?.unit}` : "—"}</td>
                    <td className="p-2">{diff == null ? (r.a ? "supprimé" : "ajouté") : diff === 0 ? "=" : diff > 0 ? `+${diff}` : `${diff}`}</td>
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
