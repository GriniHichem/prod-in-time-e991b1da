import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { globalSearch, searchSuggest } from "@/lib/search";

describe("globalSearch", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("does not call the RPC when query is empty and no filters are set", async () => {
    const r = await globalSearch("");
    expect(rpcMock).not.toHaveBeenCalled();
    expect(r.results).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("calls global_search RPC with parsed parameters", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await globalSearch('module:tickets statut:ouvert "fuite huile" from:2026-01-01', {
      limitPerModule: 5,
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, params] = rpcMock.mock.calls[0];
    expect(name).toBe("global_search");
    expect(params.q).toBe("fuite huile");
    expect(params.modules).toEqual(["tickets"]);
    expect(params.date_from).toBe("2026-01-01");
    expect(params.limit_per_module).toBe(5);
  });

  it("groups results by module", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { module: "tickets", entity_id: "t1", code: "TKT-1", label: "x", snippet: "fuite huile pompe", score: 0.9, severity: null, url: "/tickets/t1", updated_at: null },
        { module: "tickets", entity_id: "t2", code: "TKT-2", label: "y", snippet: "fuite", score: 0.7, severity: null, url: "/tickets/t2", updated_at: null },
        { module: "machines", entity_id: "m1", code: "M-1", label: "z", snippet: "fuite", score: 0.5, severity: null, url: "/machines/m1", updated_at: null },
      ],
      error: null,
    });

    const r = await globalSearch("fuite");
    expect(r.total).toBe(3);
    expect(Object.keys(r.grouped).sort()).toEqual(["machines", "tickets"]);
    expect(r.grouped.tickets).toHaveLength(2);
  });

  it("filters out rows matching excluded tokens (-mot)", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { module: "tickets", entity_id: "t1", code: "TKT-1", label: null, snippet: "fuite huile resolu", score: 0.9, severity: null, url: null, updated_at: null },
        { module: "tickets", entity_id: "t2", code: "TKT-2", label: null, snippet: "fuite huile", score: 0.8, severity: null, url: null, updated_at: null },
      ],
      error: null,
    });

    const r = await globalSearch("fuite -resolu");
    expect(r.total).toBe(1);
    expect(r.results[0].entity_id).toBe("t2");
  });

  it("strips unknown module keys before calling RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await globalSearch("module:tickets,fake_table fuite");
    const [, params] = rpcMock.mock.calls[0];
    expect(params.modules).toEqual(["tickets"]);
  });

  it("throws a descriptive error when RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(globalSearch("fuite")).rejects.toThrow("Recherche globale: boom");
  });

  it("respects maxTotal cap", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      module: "tickets", entity_id: `t${i}`, code: `T${i}`, label: null, snippet: "x", score: 1 - i / 20, severity: null, url: null, updated_at: null,
    }));
    rpcMock.mockResolvedValue({ data: rows, error: null });
    const r = await globalSearch("test", { maxTotal: 5 });
    expect(r.total).toBe(5);
  });
});

describe("searchSuggest", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("returns [] when query is shorter than 2 characters", async () => {
    expect(await searchSuggest("a")).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("calls search_suggest RPC with trimmed query", async () => {
    rpcMock.mockResolvedValue({ data: [{ module: "tickets", code: "T1", label: "x", url: "/tickets/x", score: 0.9 }], error: null });
    const out = await searchSuggest("  fui  ", 5);
    expect(rpcMock).toHaveBeenCalledWith("search_suggest", { q: "fui", max_results: 5 });
    expect(out).toHaveLength(1);
  });

  it("throws when RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc failed" } });
    await expect(searchSuggest("fuite")).rejects.toThrow("Suggestions: rpc failed");
  });
});
