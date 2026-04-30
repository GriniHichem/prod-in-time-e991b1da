import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, ClipboardList, LayoutDashboard, Search } from "lucide-react";
import logoEntreprise from "@/assets/logo-entreprise.jpg";
import { cn } from "@/lib/utils";
import { useInventoryPermissions } from "@/hooks/useInventoryPermissions";

/**
 * Dedicated, isolated layout for the Inventaire module.
 * Used when the user is an inventory-only user (no other roles).
 * Displays a minimal kiosk-style top bar — no GMAO/GPAO/Qualité sidebar.
 */
export function InventoryLayout() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { canManage } = useInventoryPermissions();

  const displayName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim() || "Utilisateur"
    : "Utilisateur";

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-muted-foreground hover:text-foreground hover:bg-muted"
    );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="h-9 w-9 rounded-md overflow-hidden border shrink-0">
            <img src={logoEntreprise} alt="Entreprise" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col leading-tight mr-3">
            <span className="text-[13px] font-extrabold tracking-wider uppercase">Inventaire</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">PROD IN TIME</span>
          </div>

          <nav className="flex items-center gap-1 ml-2">
            <NavLink to="/inventaire" end className={linkClass}>
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Accueil</span>
            </NavLink>
            <NavLink to="/inventaire/campagnes" className={linkClass}>
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Campagnes</span>
            </NavLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/pdr")}
              className="text-muted-foreground hover:text-foreground"
              title="Consulter les fiches PDR (lecture seule)"
            >
              <Search className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Fiches PDR</span>
            </Button>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold">{displayName}</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {canManage ? "Responsable inventaire" : "Agent inventaire"}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} title="Déconnexion">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-3 py-4 md:px-5 md:py-5">
        <Outlet />
      </main>
    </div>
  );
}
