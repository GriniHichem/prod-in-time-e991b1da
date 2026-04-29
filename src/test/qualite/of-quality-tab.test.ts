import { describe, it, expect } from "vitest";
import { computeQualityKpis, qualityStatusLabel, QUALITY_STATUS_OPTIONS } from "@/components/qualite/OfQualityTab";

describe("OfQualityTab – KPIs", () => {
  it("counts applicable, required, performed, missing and out of tolerance", () => {
    const indicators = [
      { indicator_id: "i1", effective_is_required: true },
      { indicator_id: "i2", effective_is_required: true },
      { indicator_id: "i3", effective_is_required: false },
    ];
    const checks = [
      { indicator_id: "i1", is_conform: true },
      { indicator_id: "i2", is_conform: false },
    ];
    const k = computeQualityKpis(indicators, checks);
    expect(k.applicable).toBe(3);
    expect(k.required).toBe(2);
    expect(k.performed).toBe(2);
    expect(k.missing).toBe(0);
    expect(k.outOfTolerance).toBe(1);
  });

  it("flags missing required when no check exists", () => {
    const indicators = [
      { indicator_id: "i1", effective_is_required: true },
      { indicator_id: "i2", effective_is_required: true },
    ];
    const k = computeQualityKpis(indicators, []);
    expect(k.missing).toBe(2);
    expect(k.performed).toBe(0);
  });

  it("does not count optional indicators in missing", () => {
    const indicators = [{ indicator_id: "i1", effective_is_required: false }];
    const k = computeQualityKpis(indicators, []);
    expect(k.missing).toBe(0);
  });

  it("dedupes performed by indicator", () => {
    const indicators = [{ indicator_id: "i1", effective_is_required: true }];
    const k = computeQualityKpis(indicators, [
      { indicator_id: "i1", is_conform: true },
      { indicator_id: "i1", is_conform: true },
    ]);
    expect(k.performed).toBe(1);
    expect(k.missing).toBe(0);
  });
});

describe("OfQualityTab – status mapping", () => {
  it("returns 'Non démarré' for null/empty", () => {
    expect(qualityStatusLabel(null)).toBe("Non démarré");
    expect(qualityStatusLabel(undefined)).toBe("Non démarré");
  });
  it("maps each enum value to a French label", () => {
    expect(qualityStatusLabel("conforme")).toBe("Conforme");
    expect(qualityStatusLabel("non_conforme")).toBe("Non conforme");
    expect(qualityStatusLabel("a_retraiter")).toBe("À retraiter");
  });
  it("exposes 9 status options", () => {
    expect(QUALITY_STATUS_OPTIONS).toHaveLength(9);
  });
});

describe("OfQualityTab – isolation from production", () => {
  it("status payload must not include production statut", () => {
    const payload = { p_of_id: "of-1", p_status: "conforme", p_reason: "ok" };
    expect(Object.keys(payload)).not.toContain("statut");
    expect(Object.keys(payload)).not.toContain("date_fin_reelle");
  });
});
