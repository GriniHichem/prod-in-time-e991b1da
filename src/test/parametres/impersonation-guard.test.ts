import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

const mocks = vi.hoisted(() => ({
  realInsert: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
  realSelect: vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null }),
  realInvoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  realRpc: vi.fn().mockResolvedValue({ data: 42, error: null }),
}));
const { realInsert, realSelect, realInvoke, realRpc } = mocks;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: mocks.realInsert, select: mocks.realSelect, update: mocks.realInsert, delete: mocks.realInsert, upsert: mocks.realInsert })),
    functions: { invoke: mocks.realInvoke },
    rpc: mocks.realRpc,
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { installImpersonationGuard, uninstallImpersonationGuard } from "@/lib/impersonationGuard";

beforeEach(() => {
  realInsert.mockClear();
  realSelect.mockClear();
  realInvoke.mockClear();
  realRpc.mockClear();
});
afterEach(() => uninstallImpersonationGuard());

describe("impersonation guard", () => {
  it("blocks insert/update/delete/upsert when active", async () => {
    installImpersonationGuard();
    const ins: any = await (supabase.from("tickets") as any).insert({ a: 1 });
    expect(ins.error).toBeTruthy();
    expect(realInsert).not.toHaveBeenCalled();
  });

  it("blocks rpc and functions.invoke", async () => {
    installImpersonationGuard();
    const r: any = await (supabase as any).rpc("do_thing");
    const f: any = await supabase.functions.invoke("send-email");
    expect(r.error).toBeTruthy();
    expect(f.error).toBeTruthy();
    expect(realRpc).not.toHaveBeenCalled();
    expect(realInvoke).not.toHaveBeenCalled();
  });

  it("does not block reads (select)", async () => {
    installImpersonationGuard();
    const res: any = await (supabase.from("tickets") as any).select("*");
    expect(res.error).toBeNull();
    expect(realSelect).toHaveBeenCalled();
  });

  it("restores normal write behavior after uninstall", async () => {
    installImpersonationGuard();
    uninstallImpersonationGuard();
    const ins: any = await (supabase.from("tickets") as any).insert({ a: 1 });
    expect(ins.error).toBeNull();
    expect(realInsert).toHaveBeenCalled();
  });
});
