import { z } from "zod";

/**
 * Centralized form-validation schemas (Zod) for mobile/tablet inline validation.
 * Used by ShiftScreen, TicketsList, TicketDetail to disable submit buttons and
 * surface inline errors before any Supabase call.
 */

const uuid = z.string().uuid({ message: "Identifiant invalide" });

export const ticketCreateSchema = z.object({
  machine_id: uuid.refine((v) => !!v, { message: "Sélectionnez une machine" }),
  description: z
    .string()
    .trim()
    .min(1, { message: "Description obligatoire" })
    .max(1000, { message: "Description trop longue (max 1000 caractères)" }),
  priorite: z.enum(["basse", "normale", "haute", "critique"], {
    message: "Priorité invalide",
  }),
});
export type TicketCreateInput = z.infer<typeof ticketCreateSchema>;

export const productionDeclareSchema = z.object({
  of_id: uuid.refine((v) => !!v, { message: "OF requis" }),
  slot_index: z
    .number({ message: "Sélectionnez un créneau horaire" })
    .int()
    .min(0, { message: "Sélectionnez un créneau horaire" }),
  quantite_produite: z
    .number({ message: "Quantité produite requise" })
    .min(0, { message: "Quantité produite >= 0" }),
  quantite_rebut: z
    .number()
    .min(0, { message: "Rebut >= 0" })
    .default(0),
  slot_editable: z.literal(true, {
    message: "Hors fenêtre de saisie autorisée",
  }),
});
export type ProductionDeclareInput = z.infer<typeof productionDeclareSchema>;

export const shiftStartSchema = z.object({
  team_id: uuid.refine((v) => !!v, { message: "Équipe requise" }),
  slot_id: uuid.refine((v) => !!v, { message: "Créneau requis" }),
  of_id: uuid.refine((v) => !!v, { message: "OF requis" }),
  line_id: uuid.refine((v) => !!v, { message: "Ligne requise (l'OF doit être assigné à une ligne)" }),
});
export type ShiftStartInput = z.infer<typeof shiftStartSchema>;

/**
 * Get a flat field->message map from a Zod safeParse error.
 * Returns {} when the input is valid.
 */
export function getFieldErrors<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): Record<string, string> {
  const result = schema.safeParse(data);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Returns true when no field has an error. */
export function isValid(errors: Record<string, string>): boolean {
  return Object.keys(errors).length === 0;
}

/**
 * Parse a numeric input that may use comma as decimal separator
 * (project convention). Returns NaN when the string is empty or invalid.
 */
export function parseNumericInput(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  const normalized = String(value).replace(",", ".").trim();
  return Number(normalized);
}
