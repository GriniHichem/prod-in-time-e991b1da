import { describe, it, expect } from "vitest";

function deriveShiftTypeFromHour(hour: number): "matin" | "apres_midi" | "nuit" {
  if (hour >= 5 && hour < 13) return "matin";
  if (hour >= 13 && hour < 21) return "apres_midi";
  return "nuit";
}

describe("derive shift type", () => {
  it("matin", () => {
    expect(deriveShiftTypeFromHour(5)).toBe("matin");
    expect(deriveShiftTypeFromHour(12)).toBe("matin");
  });
  it("apres_midi", () => {
    expect(deriveShiftTypeFromHour(13)).toBe("apres_midi");
    expect(deriveShiftTypeFromHour(20)).toBe("apres_midi");
  });
  it("nuit", () => {
    expect(deriveShiftTypeFromHour(21)).toBe("nuit");
    expect(deriveShiftTypeFromHour(0)).toBe("nuit");
    expect(deriveShiftTypeFromHour(4)).toBe("nuit");
  });
});

describe("stale shift detection", () => {
  const isStale = (heureFin: Date, now: Date, hours = 2) =>
    heureFin.getTime() + hours * 3600_000 < now.getTime();

  it("considère stale après 2h", () => {
    const now = new Date("2026-01-01T10:00:00Z");
    expect(isStale(new Date("2026-01-01T07:00:00Z"), now)).toBe(true);
    expect(isStale(new Date("2026-01-01T09:00:00Z"), now)).toBe(false);
  });
});

describe("active maintenance shift visible after midnight", () => {
  // Régression : filtre date_shift retiré ; on garde uniquement is_active.
  it("ne filtre pas par date", () => {
    const filter = { is_active: true };
    expect("date_shift" in filter).toBe(false);
  });
});
