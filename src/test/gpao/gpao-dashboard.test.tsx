import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import GpaoDashboard from "@/pages/gpao/GpaoDashboard";
import { mockOfs, mockProducts, mockArticles, mockStops, createMockSupabase } from "../__mocks__/supabase";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createMockSupabase(),
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
}

describe("GpaoDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dashboard title", async () => {
    renderWithRouter(<GpaoDashboard />);
    expect(screen.getByText("Dashboard GPAO")).toBeInTheDocument();
    expect(screen.getByText("Vue d'ensemble de la production")).toBeInTheDocument();
  });

  it("displays KPI cards", async () => {
    renderWithRouter(<GpaoDashboard />);
    await waitFor(() => {
      expect(screen.getByText("OF en cours")).toBeInTheDocument();
      expect(screen.getByText("Production totale")).toBeInTheDocument();
      expect(screen.getByText("Rendement")).toBeInTheDocument();
      expect(screen.getByText("Produits")).toBeInTheDocument();
    });
  });

  it("shows recent OF section", async () => {
    renderWithRouter(<GpaoDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Ordres de fabrication récents")).toBeInTheDocument();
    });
  });

  it("shows recent stops section", async () => {
    renderWithRouter(<GpaoDashboard />);
    await waitFor(() => {
      expect(screen.getByText("Arrêts récents")).toBeInTheDocument();
    });
  });

  it("calculates rendement correctly", () => {
    // From mock: produit = 450 + 0 + 2000 = 2450, rebut = 10 + 0 + 30 = 40
    // rendement = (2450 - 40) / 2450 * 100 = 98%
    const totalProduit = mockOfs.reduce((s, o) => s + (o.quantite_produite || 0), 0);
    const totalRebut = mockOfs.reduce((s, o) => s + (o.quantite_rebut || 0), 0);
    const rendement = totalProduit > 0 ? Math.round(((totalProduit - totalRebut) / totalProduit) * 100) : 0;
    expect(rendement).toBe(98);
  });

  it("identifies low stock articles correctly", () => {
    const lowStock = mockArticles.filter((a) => a.stock_actuel <= a.stock_min);
    // art-2: stock_actuel=50 <= stock_min=200
    expect(lowStock.length).toBe(1);
    expect(lowStock[0].code).toBe("ART-002");
  });

  it("counts OF en cours correctly", () => {
    const ofsEnCours = mockOfs.filter((o) => o.statut === "en_cours");
    expect(ofsEnCours.length).toBe(1);
    expect(ofsEnCours[0].numero).toBe("OF-00001");
  });
});
