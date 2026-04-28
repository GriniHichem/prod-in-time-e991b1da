import { describe, expect, it } from "vitest";
import {
  FALLBACK_MODULE,
  KNOWN_MODULE_KEYS,
  getModuleDefinition,
  listModules,
  listModulesByGroup,
} from "@/lib/searchCatalog";

describe("searchCatalog", () => {
  it("exposes all modules indexed in Phase 1 (DB)", () => {
    // Si on ajoute une table indexée DB, elle DOIT être enregistrée ici.
    const expected = [
      "machines",
      "equipements",
      "organes",
      "lignes",
      "pdr",
      "tickets",
      "interventions",
      "ordres_fabrication",
      "products",
      "articles",
      "recipes",
      "consumptions",
      "arrets",
      "preventif_plans",
      "notifications",
      "audit_logs",
      "validation_requests",
      "entity_documents",
      "pdr_stock_movements",
      "pdr_family_suppliers",
    ].sort();
    expect([...KNOWN_MODULE_KEYS].sort()).toEqual(expected);
  });

  it("each module has icon, label, group and buildUrl()", () => {
    for (const m of listModules()) {
      expect(m.label).toBeTruthy();
      expect(m.pluralLabel).toBeTruthy();
      expect(m.icon).toBeTruthy();
      expect(m.group).toMatch(/Industriel|Production|Maintenance|Stock|Système/);
      expect(typeof m.buildUrl).toBe("function");
      const url = m.buildUrl("abc-123");
      expect(url).toContain("abc-123");
      expect(url.startsWith("/")).toBe(true);
    }
  });

  it("returns a definition for known module key", () => {
    const def = getModuleDefinition("tickets");
    expect(def).not.toBeNull();
    expect(def?.label).toBe("Ticket");
    expect(def?.buildUrl("xyz")).toBe("/tickets/xyz");
  });

  it("returns null for unknown module key", () => {
    expect(getModuleDefinition("not_a_table")).toBeNull();
  });

  it("groups modules by category for facet rendering", () => {
    const groups = listModulesByGroup();
    expect(Object.keys(groups).sort()).toEqual(
      ["Industriel", "Maintenance", "Production", "Stock", "Système"].sort(),
    );
    expect(groups.Maintenance.some((m) => m.key === "tickets")).toBe(true);
    expect(groups.Production.some((m) => m.key === "ordres_fabrication")).toBe(
      true,
    );
    expect(groups.Stock.some((m) => m.key === "pdr")).toBe(true);
  });

  it("FALLBACK_MODULE remains a valid definition", () => {
    expect(FALLBACK_MODULE.icon).toBeTruthy();
    expect(FALLBACK_MODULE.buildUrl("x")).toContain("x");
  });
});
