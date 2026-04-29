import { describe, it, expect } from "vitest";
import { generateMigrationSql, type AccessControlSnapshot } from "@/lib/accessControlExport";

const empty: AccessControlSnapshot = {
  exported_at: "2026-04-29T00:00:00.000Z",
  version: 1,
  role_permissions: [],
  document_permissions: [],
  pdr_stock_permissions: [],
  validation_permissions: [],
  quality_permissions: [],
  custom_roles: [],
  audit_role_settings: [],
  control_switches: [],
};

describe("accessControlExport", () => {
  it("produces a header even when empty", () => {
    const sql = generateMigrationSql(empty);
    expect(sql).toContain("Access Control snapshot");
    expect(sql).toContain("Exported: 2026-04-29");
  });

  it("emits INSERT for quality_permissions rows with conflict clause", () => {
    const snap: AccessControlSnapshot = {
      ...empty,
      quality_permissions: [{ role: "admin", can_create_check: true, can_validate_check: false }],
    };
    const sql = generateMigrationSql(snap);
    expect(sql).toContain("INSERT INTO public.quality_permissions");
    expect(sql).toContain("ON CONFLICT (role) DO NOTHING");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("true");
  });

  it("escapes single quotes safely", () => {
    const snap: AccessControlSnapshot = {
      ...empty,
      custom_roles: [{ code: "test", label: "L'équipe", color: "#fff", inherits_from: null, is_active: true }],
    };
    const sql = generateMigrationSql(snap);
    expect(sql).toContain("L''équipe");
  });

  it("emits UPDATE for control switches", () => {
    const snap: AccessControlSnapshot = {
      ...empty,
      control_switches: [{ key: "control.enforce_audit", value: "true" }],
    };
    const sql = generateMigrationSql(snap);
    expect(sql).toContain("UPDATE public.app_settings");
    expect(sql).toContain("control.enforce_audit");
  });
});
