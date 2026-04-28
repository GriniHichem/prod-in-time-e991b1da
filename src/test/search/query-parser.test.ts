import { describe, expect, it } from "vitest";
import { parseSearchQuery, stringifyParsedQuery } from "@/lib/searchQueryParser";

describe("parseSearchQuery", () => {
  it("returns an empty parse for empty input", () => {
    const p = parseSearchQuery("");
    expect(p.fts).toBe("");
    expect(p.modules).toEqual([]);
    expect(p.filters).toEqual({});
    expect(p.dateFrom).toBeNull();
    expect(p.dateTo).toBeNull();
  });

  it("treats simple words as AND tokens for FTS", () => {
    const p = parseSearchQuery("fuite huile pompe");
    expect(p.fts).toBe("fuite huile pompe");
    expect(p.phrases).toEqual([]);
    expect(p.excluded).toEqual([]);
  });

  it("captures exact phrases between quotes", () => {
    const p = parseSearchQuery('"fuite huile" pompe');
    expect(p.phrases).toEqual(["fuite huile"]);
    expect(p.fts).toBe("fuite huile pompe");
  });

  it("captures excluded words with -prefix", () => {
    const p = parseSearchQuery("vibration -bruit -arret");
    expect(p.fts).toBe("vibration");
    expect(p.excluded).toEqual(["bruit", "arret"]);
  });

  it("parses a single module filter", () => {
    const p = parseSearchQuery("module:tickets fuite");
    expect(p.modules).toEqual(["tickets"]);
    expect(p.fts).toBe("fuite");
  });

  it("parses multi-module filters separated by commas", () => {
    const p = parseSearchQuery("module:pdr,machines roulement");
    expect(p.modules).toEqual(["pdr", "machines"]);
    expect(p.fts).toBe("roulement");
  });

  it("parses statut, crit and priorité filters with normalisation", () => {
    const p = parseSearchQuery("statut:ouvert crit:A priorité:haute");
    expect(p.filters.statut).toEqual(["ouvert"]);
    expect(p.filters.crit).toEqual(["A"]);
    expect(p.filters.priorite).toEqual(["haute"]);
  });

  it("normalises status → statut and criticité → crit", () => {
    const p = parseSearchQuery("status:closed criticité:B");
    expect(p.filters.statut).toEqual(["closed"]);
    expect(p.filters.crit).toEqual(["B"]);
  });

  it("parses ISO date filters from: and to:", () => {
    const p = parseSearchQuery("from:2026-01-01 to:2026-04-30 fuite");
    expect(p.dateFrom).toBe("2026-01-01");
    expect(p.dateTo).toBe("2026-04-30");
    expect(p.fts).toBe("fuite");
  });

  it("ignores invalid date formats silently (no FTS pollution)", () => {
    const p = parseSearchQuery("from:hier to:demain");
    expect(p.dateFrom).toBeNull();
    expect(p.dateTo).toBeNull();
    // Comportement voulu : un filtre reconnu (from/to) avec valeur invalide
    // est ignoré sans contaminer la requête FTS.
    expect(p.fts).toBe("");
  });

  it("swaps inverted date bounds", () => {
    const p = parseSearchQuery("from:2026-04-30 to:2026-01-01");
    expect(p.dateFrom).toBe("2026-01-01");
    expect(p.dateTo).toBe("2026-04-30");
  });

  it("handles a complex composite query", () => {
    const p = parseSearchQuery(
      'module:tickets statut:ouvert crit:A "fuite huile" -resolu from:2026-01-01',
    );
    expect(p.modules).toEqual(["tickets"]);
    expect(p.filters.statut).toEqual(["ouvert"]);
    expect(p.filters.crit).toEqual(["A"]);
    expect(p.phrases).toEqual(["fuite huile"]);
    expect(p.excluded).toEqual(["resolu"]);
    expect(p.dateFrom).toBe("2026-01-01");
    expect(p.fts).toBe("fuite huile");
  });

  it("dedupes modules listed multiple times", () => {
    const p = parseSearchQuery("module:tickets module:tickets,pdr");
    expect(p.modules).toEqual(["tickets", "pdr"]);
  });

  it("does not treat colons inside FTS words as filters when key is unknown", () => {
    const p = parseSearchQuery("ref:ABC-123");
    // 'ref' n'est pas une clé connue → garde la forme originale
    expect(p.fts).toBe("ref:ABC-123");
    expect(p.filters.ref).toBeUndefined();
  });

  it("ignores trailing dash without a word", () => {
    const p = parseSearchQuery("- pompe");
    expect(p.excluded).toEqual([]);
    expect(p.fts).toContain("pompe");
  });

  it("stringifyParsedQuery rebuilds a readable query", () => {
    const p = parseSearchQuery(
      "module:tickets statut:ouvert fuite -resolu from:2026-01-01",
    );
    const s = stringifyParsedQuery(p);
    expect(s).toContain("fuite");
    expect(s).toContain("module:tickets");
    expect(s).toContain("statut:ouvert");
    expect(s).toContain("-resolu");
    expect(s).toContain("from:2026-01-01");
  });
});
