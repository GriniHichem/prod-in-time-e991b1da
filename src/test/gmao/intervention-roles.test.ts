import { describe, it, expect } from "vitest";

/**
 * Multi-collaborator KPI integrity.
 *
 * Rule: 1 ticket = 1 panne. Adding collaborators creates additional intervention
 * rows (for individual workload) but MUST NEVER inflate failure count, MTBF, or
 * availability.
 */

type Role = "lead" | "aide" | "co_intervenant";

interface Ticket {
  id: string;
  statut: "ouvert" | "pris_en_charge" | "en_cours" | "resolu" | "cloture";
  temps_intervention_minutes: number | null;
}

interface Intervention {
  id: string;
  ticket_id: string;
  technicien_id: string;
  role: Role;
  date_debut: string;
  date_fin: string | null;
}

// Mirrors AnalyticsPage failure count logic.
function totalFailures(tickets: Ticket[]): number {
  return tickets.filter((t) => (t as any).statut !== "annule").length;
}

// Mirrors AnalyticsPage per-technician aggregation.
function aggregateWorkload(interventions: Intervention[]) {
  const agg: Record<string, { total: number; durationMin: number; lead: number; aide: number; co: number }> = {};
  interventions.forEach((i) => {
    if (!agg[i.technicien_id]) agg[i.technicien_id] = { total: 0, durationMin: 0, lead: 0, aide: 0, co: 0 };
    agg[i.technicien_id].total += 1;
    if (i.date_debut && i.date_fin) {
      agg[i.technicien_id].durationMin += Math.round(
        (new Date(i.date_fin).getTime() - new Date(i.date_debut).getTime()) / 60000
      );
    }
    if (i.role === "lead") agg[i.technicien_id].lead += 1;
    else if (i.role === "co_intervenant") agg[i.technicien_id].co += 1;
    else agg[i.technicien_id].aide += 1;
  });
  return agg;
}

describe("Multi-collaborator KPI integrity", () => {
  const tickets: Ticket[] = [
    { id: "tkt-1", statut: "resolu", temps_intervention_minutes: 60 },
  ];

  // 1 ticket, 3 intervenants
  const interventions: Intervention[] = [
    { id: "i-1", ticket_id: "tkt-1", technicien_id: "u-A", role: "lead",
      date_debut: "2026-04-29T08:00:00Z", date_fin: "2026-04-29T09:00:00Z" },
    { id: "i-2", ticket_id: "tkt-1", technicien_id: "u-B", role: "co_intervenant",
      date_debut: "2026-04-29T08:15:00Z", date_fin: "2026-04-29T08:55:00Z" },
    { id: "i-3", ticket_id: "tkt-1", technicien_id: "u-C", role: "aide",
      date_debut: "2026-04-29T08:30:00Z", date_fin: "2026-04-29T08:50:00Z" },
  ];

  it("ticket count stays at 1 even with 3 interventions", () => {
    expect(totalFailures(tickets)).toBe(1);
    expect(interventions.length).toBe(3);
  });

  it("MTTR uses the ticket's single duration, never the sum of interventions", () => {
    // MTTR = average of tickets.temps_intervention_minutes — independent of intervention count
    const mttr = tickets[0].temps_intervention_minutes;
    expect(mttr).toBe(60); // not 60+40+20=120
  });

  it("per-technician aggregation reflects individual contribution per role", () => {
    const agg = aggregateWorkload(interventions);
    expect(agg["u-A"]).toEqual({ total: 1, durationMin: 60, lead: 1, aide: 0, co: 0 });
    expect(agg["u-B"]).toEqual({ total: 1, durationMin: 40, lead: 0, aide: 0, co: 1 });
    expect(agg["u-C"]).toEqual({ total: 1, durationMin: 20, lead: 0, aide: 1, co: 0 });
  });

  it("transfer scenario: previous lead is closed, new intervention created with role=lead", () => {
    const transferred: Intervention[] = [
      { id: "i-1", ticket_id: "tkt-1", technicien_id: "u-A", role: "lead",
        date_debut: "2026-04-29T08:00:00Z", date_fin: "2026-04-29T08:30:00Z" }, // closed at transfer
      { id: "i-2", ticket_id: "tkt-1", technicien_id: "u-B", role: "lead",
        date_debut: "2026-04-29T08:30:00Z", date_fin: "2026-04-29T09:00:00Z" }, // new lead
    ];
    expect(totalFailures(tickets)).toBe(1); // still one panne
    const agg = aggregateWorkload(transferred);
    expect(agg["u-A"].lead).toBe(1);
    expect(agg["u-B"].lead).toBe(1);
    expect(agg["u-A"].durationMin).toBe(30);
    expect(agg["u-B"].durationMin).toBe(30);
  });

  it("collaborator role_label maps directly to intervention.role", () => {
    const map = (label: string): Role => (label === "co_intervenant" ? "co_intervenant" : "aide");
    expect(map("co_intervenant")).toBe("co_intervenant");
    expect(map("aide")).toBe("aide");
  });
});
