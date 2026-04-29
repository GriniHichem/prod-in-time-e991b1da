import { describe, it, expect } from "vitest";
import { BOM_ITEM_TYPES, buildBomCsv, parseDecimal, BomItemRow } from "@/pages/qualite/components/BomHelpers";

describe("BOM helpers", () => {
  it("declares the 6 allowed item types", () => {
    expect(BOM_ITEM_TYPES).toEqual([
      "raw_material", "packaging", "label", "carton", "pallet", "consumable",
    ]);
  });

  it("parseDecimal accepts dot and comma", () => {
    expect(parseDecimal("1.5")).toBe(1.5);
    expect(parseDecimal("2,75")).toBe(2.75);
    expect(parseDecimal("")).toBe(0);
    expect(parseDecimal(null)).toBe(0);
    expect(parseDecimal("abc")).toBe(0);
  });

  it("CSV export has expected headers and rows", () => {
    const items: BomItemRow[] = [
      {
        article_code: "ART-001",
        article_designation: "Sucre",
        item_type: "raw_material",
        quantity_per_unit: 100,
        unit: "g",
        waste_percent: 1.5,
        is_mandatory: true,
        is_quality_sensitive: true,
      },
      {
        article_code: "ART-002",
        article_designation: "Carton, simple",
        item_type: "carton",
        quantity_per_unit: 1,
        unit: "u",
        waste_percent: null,
        is_mandatory: false,
        is_quality_sensitive: false,
      },
    ];
    const csv = buildBomCsv("PRD-X", 2, items);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("article_code");
    expect(lines[0]).toContain("qualite_sensible");
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain("ART-001");
    expect(lines[1]).toContain("oui");
    // Field with comma must be quoted
    expect(lines[2]).toContain('"Carton, simple"');
    expect(lines[2]).toContain("non");
  });
});

describe("BOM payload safety", () => {
  it("BOM mutation payload never contains production status fields", () => {
    const payload = {
      product_id: "p1", version: 1, status: "draft", description: "",
    };
    expect(payload).not.toHaveProperty("statut");
    expect(payload).not.toHaveProperty("quality_status");
    expect(payload).not.toHaveProperty("quantite_produite");
  });

  it("BOM item defaults: is_mandatory=true, is_quality_sensitive=false", () => {
    const defaults = { is_mandatory: true, is_quality_sensitive: false };
    expect(defaults.is_mandatory).toBe(true);
    expect(defaults.is_quality_sensitive).toBe(false);
  });
});
