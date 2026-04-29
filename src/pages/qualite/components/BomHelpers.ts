export const BOM_ITEM_TYPES = [
  "raw_material",
  "packaging",
  "label",
  "carton",
  "pallet",
  "consumable",
] as const;

export type BomItemType = (typeof BOM_ITEM_TYPES)[number];

export const BOM_ITEM_TYPE_LABELS: Record<BomItemType, string> = {
  raw_material: "Matière première",
  packaging: "Emballage",
  label: "Étiquette",
  carton: "Carton",
  pallet: "Palette",
  consumable: "Consommable",
};

export const BOM_STATUSES = ["draft", "active", "archived"] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

export const BOM_STATUS_LABELS: Record<BomStatus, string> = {
  draft: "Brouillon",
  active: "Active",
  archived: "Archivée",
};

/** Parse user input that may use "," or "." as decimal separator. */
export function parseDecimal(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export interface BomItemRow {
  article_code: string;
  article_designation: string;
  item_type: BomItemType;
  quantity_per_unit: number;
  unit: string;
  waste_percent: number | null;
  is_mandatory: boolean;
  is_quality_sensitive: boolean;
}

export function buildBomCsv(productLabel: string, version: number, items: BomItemRow[]): string {
  const header = [
    "produit",
    "version",
    "article_code",
    "article_designation",
    "type",
    "quantite_par_unite",
    "unite",
    "perte_pct",
    "obligatoire",
    "qualite_sensible",
  ];
  const escape = (s: unknown) => {
    const str = String(s ?? "");
    return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = items.map((it) => [
    productLabel,
    version,
    it.article_code,
    it.article_designation,
    it.item_type,
    it.quantity_per_unit,
    it.unit,
    it.waste_percent ?? "",
    it.is_mandatory ? "oui" : "non",
    it.is_quality_sensitive ? "oui" : "non",
  ].map(escape).join(","));
  return [header.join(","), ...rows].join("\n");
}
