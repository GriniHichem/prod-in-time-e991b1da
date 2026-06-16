import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetMockState, mockState } from "./_validation-mocks";

vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./_validation-mocks");
  return { supabase: mod.createConfigurableSupabase() };
});
const logAudit = vi.fn(async () => {});
vi.mock("@/lib/audit", () => ({
  logAudit: (...a: unknown[]) => logAudit(...(a as [])),
  sanitizeValues: (v: unknown) => v,
  computeChangedFields: (a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) => {
    if (!a || !b) return [] as string[];
    return Object.keys(b).filter((k) => a[k] !== b[k]);
  },
}));
const triggerNotification = vi.fn(async () => {});
vi.mock("@/lib/notifications", () => ({
  triggerNotification: (...a: unknown[]) => triggerNotification(...(a as [])),
}));

import { createValidationRequest, type ValidationRule } from "@/lib/validation";

const rule = (over: Partial<ValidationRule>): ValidationRule => ({
  id: "r1",
  name: "rule",
  description: null,
  module: "pdr_stock",
  entity_type: "pdr_movement",
  action_type: "correction",
  enforcement: "blocking",
  is_active: true,
  is_required: true,
  priority: "medium",
  validator_roles: ["resp_maintenance"],
  validator_users: [],
  conditions: null,
  auto_approve_if_low_risk: false,
  ...over,
});

const payload = (r: ValidationRule | null, over: Record<string, unknown> = {}) => ({
  rule: r,
  request_type: "correction",
  module: "pdr_stock",
  requested_action: "correction",
  title: "Test",
  ...over,
});

beforeEach(() => {
  resetMockState();
  logAudit.mockClear();
  triggerNotification.mockClear();
  // single() echoes the inserted row so the function returns successfully
  mockState.singleByTable.validation_requests = { data: { id: "new" }, error: null };
});

describe("createValidationRequest", () => {
  it("no user → null, no insert", async () => {
    mockState.user = null;
    const res = await createValidationRequest(payload(rule({})) as never);
    expect(res).toBeNull();
    expect(mockState.inserted).toBeNull();
  });

  it("blocking rule → submitted, is_blocking, applied_at null", async () => {
    await createValidationRequest(payload(rule({ enforcement: "blocking" })) as never);
    expect(mockState.inserted?.status).toBe("submitted");
    expect(mockState.inserted?.is_blocking).toBe(true);
    expect(mockState.inserted?.applied_at).toBeNull();
  });

  it("post_hoc without auto-approve → pending_post_hoc, applied_at set", async () => {
    await createValidationRequest(payload(rule({ enforcement: "post_hoc" })) as never);
    expect(mockState.inserted?.status).toBe("pending_post_hoc");
    expect(mockState.inserted?.applied_at).not.toBeNull();
  });

  it("post_hoc + auto_approve + low priority → approved", async () => {
    await createValidationRequest(
      payload(rule({ enforcement: "post_hoc", auto_approve_if_low_risk: true, priority: "low" })) as never
    );
    expect(mockState.inserted?.status).toBe("approved");
    expect(mockState.inserted?.validation_comment).toBe("Auto-approuvée (risque faible)");
    expect(mockState.inserted?.validated_at).not.toBeNull();
  });

  it("auto_approve true but medium priority → NOT auto-approved", async () => {
    await createValidationRequest(
      payload(rule({ enforcement: "post_hoc", auto_approve_if_low_risk: true, priority: "medium" })) as never
    );
    expect(mockState.inserted?.status).toBe("pending_post_hoc");
  });

  it("assigns validator role and user from rule", async () => {
    await createValidationRequest(
      payload(rule({ validator_roles: ["resp_production"], validator_users: ["u-9"] })) as never
    );
    expect(mockState.inserted?.assigned_validator_role).toBe("resp_production");
    expect(mockState.inserted?.assigned_validator_user_id).toBe("u-9");
  });

  it("computes changed_fields from old/proposed values", async () => {
    await createValidationRequest(
      payload(rule({}), { old_values: { qty: 1, name: "a" }, proposed_values: { qty: 2, name: "a" } }) as never
    );
    expect(mockState.inserted?.changed_fields).toEqual(["qty"]);
  });

  it("notifies validators only when validator_roles present", async () => {
    await createValidationRequest(payload(rule({ validator_roles: [] })) as never);
    expect(triggerNotification).not.toHaveBeenCalled();
    triggerNotification.mockClear();
    await createValidationRequest(payload(rule({ validator_roles: ["admin"] })) as never);
    expect(triggerNotification).toHaveBeenCalledTimes(1);
  });
});
