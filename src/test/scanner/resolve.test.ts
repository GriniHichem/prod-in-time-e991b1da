import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

import { resolveScannedCode, normalizeScanInput, isAutoSelectable } from "@/lib/scanResolver";

describe("normalizeScanInput", () => {
  it("trims and removes invisible chars", () => {
    expect(normalizeScanInput("  \uFEFFABC \u200B")).toBe("ABC");
  });
  it("extracts pathname from absolute URL", () => {
    expect(normalizeScanInput("https://app.example.com/pdr/123?x=1")).toBe("/pdr/123?x=1");
  });
  it("returns empty for empty input", () => {
    expect(normalizeScanInput("")).toBe("");
  });
});

describe("resolveScannedCode", () => {
  beforeEach(() => rpcMock.mockReset());

  it("returns empty for empty input without calling RPC", async () => {
    expect(await resolveScannedCode("   ")).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("normalizes URL payload before RPC call", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await resolveScannedCode("https://app.example.com/pdr/abc");
    expect(rpcMock).toHaveBeenCalledWith("resolve_scanned_code", { p_code: "/pdr/abc" });
  });

  it("filters by allowedTypes", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { entity_type: "pdr", entity_id: "1", code: "P", label: "L", matched_field: "code_erp", match_quality: "exact", url: "/pdr/1" },
        { entity_type: "machine", entity_id: "2", code: "M", label: "L", matched_field: "code_erp", match_quality: "exact", url: "/machines/2" },
      ],
      error: null,
    });
    const r = await resolveScannedCode("X", ["pdr"]);
    expect(r).toHaveLength(1);
    expect(r[0].entity_type).toBe("pdr");
  });

  it("dedupes by (type,id) keeping highest quality match", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { entity_type: "pdr", entity_id: "1", code: "P", label: "L", matched_field: "reference", match_quality: "prefix", url: "/pdr/1" },
        { entity_type: "pdr", entity_id: "1", code: "P", label: "L", matched_field: "code_erp", match_quality: "exact", url: "/pdr/1" },
      ],
      error: null,
    });
    const r = await resolveScannedCode("X");
    expect(r).toHaveLength(1);
    expect(r[0].match_quality).toBe("exact");
  });

  it("sorts by quality (url > uuid > exact > prefix)", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { entity_type: "pdr", entity_id: "3", code: "C", label: "L", matched_field: "ref", match_quality: "prefix", url: "/pdr/3" },
        { entity_type: "machine", entity_id: "1", code: "A", label: "L", matched_field: "code", match_quality: "url", url: "/machines/1" },
        { entity_type: "organe", entity_id: "2", code: "B", label: "L", matched_field: "code", match_quality: "exact", url: "/organes/2" },
      ],
      error: null,
    });
    const r = await resolveScannedCode("X");
    expect(r.map((x) => x.match_quality)).toEqual(["url", "exact", "prefix"]);
  });

  it("throws on supabase error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(resolveScannedCode("X")).rejects.toThrow(/boom/);
  });
});

describe("isAutoSelectable", () => {
  const row = (q: any) => ({ entity_type: "pdr", entity_id: "1", code: "C", label: "L", matched_field: "ref", match_quality: q, url: "/pdr/1" } as any);
  it("auto selects single strong match", () => {
    expect(isAutoSelectable([row("exact")])).toBe(true);
    expect(isAutoSelectable([row("url")])).toBe(true);
    expect(isAutoSelectable([row("uuid")])).toBe(true);
  });
  it("does not auto select prefix match", () => {
    expect(isAutoSelectable([row("prefix")])).toBe(false);
  });
  it("does not auto select multiple matches", () => {
    expect(isAutoSelectable([row("exact"), row("exact")])).toBe(false);
  });
  it("does not auto select empty", () => {
    expect(isAutoSelectable([])).toBe(false);
  });
});
