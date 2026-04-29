import { describe, it, expect } from "vitest";
import {
  ticketCreateSchema,
  productionDeclareSchema,
  shiftStartSchema,
  getFieldErrors,
  isValid,
  parseNumericInput,
} from "@/lib/formValidation";

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

describe("ticketCreateSchema", () => {
  it("rejects ticket without machine", () => {
    const errs = getFieldErrors(ticketCreateSchema, {
      machine_id: "", description: "Panne moteur", priorite: "normale",
    });
    expect(errs.machine_id).toBeTruthy();
    expect(isValid(errs)).toBe(false);
  });

  it("rejects empty description", () => {
    const errs = getFieldErrors(ticketCreateSchema, {
      machine_id: UUID, description: "   ", priorite: "normale",
    });
    expect(errs.description).toBeTruthy();
  });

  it("rejects description > 1000 chars", () => {
    const errs = getFieldErrors(ticketCreateSchema, {
      machine_id: UUID, description: "x".repeat(1001), priorite: "normale",
    });
    expect(errs.description).toBeTruthy();
  });

  it("accepts a valid payload", () => {
    const errs = getFieldErrors(ticketCreateSchema, {
      machine_id: UUID, description: "OK", priorite: "haute",
    });
    expect(isValid(errs)).toBe(true);
  });
});

describe("productionDeclareSchema", () => {
  it("rejects when no OF", () => {
    const errs = getFieldErrors(productionDeclareSchema, {
      of_id: "", slot_index: 0, quantite_produite: 10, quantite_rebut: 0, slot_editable: true,
    });
    expect(errs.of_id).toBeTruthy();
  });

  it("rejects when slot is not editable (Hour-1)", () => {
    const errs = getFieldErrors(productionDeclareSchema, {
      of_id: UUID, slot_index: 0, quantite_produite: 10, quantite_rebut: 0, slot_editable: undefined,
    });
    expect(errs.slot_editable).toBeTruthy();
  });

  it("rejects negative quantity", () => {
    const errs = getFieldErrors(productionDeclareSchema, {
      of_id: UUID, slot_index: 0, quantite_produite: -1, quantite_rebut: 0, slot_editable: true,
    });
    expect(errs.quantite_produite).toBeTruthy();
  });

  it("accepts valid payload", () => {
    const errs = getFieldErrors(productionDeclareSchema, {
      of_id: UUID, slot_index: 2, quantite_produite: 250.5, quantite_rebut: 1.2, slot_editable: true,
    });
    expect(isValid(errs)).toBe(true);
  });
});

describe("shiftStartSchema", () => {
  it("rejects missing OF line", () => {
    const errs = getFieldErrors(shiftStartSchema, {
      team_id: UUID, slot_id: UUID2, of_id: UUID, line_id: "",
    });
    expect(errs.line_id).toBeTruthy();
  });

  it("accepts complete payload", () => {
    const errs = getFieldErrors(shiftStartSchema, {
      team_id: UUID, slot_id: UUID2, of_id: UUID, line_id: UUID2,
    });
    expect(isValid(errs)).toBe(true);
  });
});

describe("parseNumericInput", () => {
  it("parses comma-decimal as dot", () => {
    expect(parseNumericInput("12,5")).toBe(12.5);
  });
  it("returns NaN for empty input", () => {
    expect(Number.isNaN(parseNumericInput(""))).toBe(true);
  });
  it("returns numbers as-is", () => {
    expect(parseNumericInput(7)).toBe(7);
  });
});
