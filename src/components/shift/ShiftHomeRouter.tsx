import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/gmao/AppLayout";
import { GlobalSearchProvider } from "@/components/search/GlobalSearchProvider";
import { RespShiftConsole } from "@/components/shift/RespShiftConsole";
import { ShiftLayout } from "@/components/shift/ShiftLayout";
import { ShiftGuard } from "@/components/shift/ShiftGuard";
import { ActiveShiftProvider, ShiftKind } from "@/contexts/ActiveShiftContext";
import { Outlet } from "react-router-dom";

interface ShiftHomeRouterProps {
  kind: ShiftKind;
  /** Page rendered for the operator inside the kiosk layout. */
  operatorPage: React.ReactNode;
  /** Roles that should see the responsable console (in standard sidebar layout). */
  managerRoles: string[];
  /** Roles that should see the operator kiosk app. */
  operatorRoles: string[];
}

/**
 * Decides whether to show the responsable console (full app layout) or the
 * operator kiosk (no sidebar) based on the connected user's roles.
 *
 * - Managers (resp_*, admin) → console with sidebar to open/close sessions.
 * - Operators (chef_ligne / maintenancier / controleur_qualite) → kiosk app.
 * - Anyone else → redirect to /apps.
 */
export function ShiftHomeRouter({ kind, operatorPage, managerRoles, operatorRoles }: ShiftHomeRouterProps) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const isManager = managerRoles.some((r) => hasRole(r as any));
  const isOperator = operatorRoles.some((r) => hasRole(r as any));

  if (isManager && !isOperator) {
    // Console responsable inside the standard app layout
    return (
      <GlobalSearchProvider>
        <AppLayout>
          <RespShiftConsole kind={kind} />
        </AppLayout>
      </GlobalSearchProvider>
    );
  }

  // Operator (or admin acting as operator) — kiosk
  return (
    <ActiveShiftProvider kind={kind}>
      <ShiftLayout>
        <ShiftGuard allowWithoutShift>{operatorPage}</ShiftGuard>
      </ShiftLayout>
    </ActiveShiftProvider>
  );
}
