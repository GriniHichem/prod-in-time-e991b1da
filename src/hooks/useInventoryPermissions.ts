import { useAuth } from "@/contexts/AuthContext";

/**
 * Inventory module access.
 *
 * Roles:
 * - responsable_inventaire : full management of campaigns
 * - agent_inventaire       : counting only (mobile kiosk)
 * - admin                  : full access
 *
 * `isInventoryOnly` = user has ONLY inventory roles (no other GMAO/GPAO/Qualité role).
 * Such users are routed to /inventaire and locked out of the rest of the app.
 */
export function useInventoryPermissions() {
  const { hasRole, roles } = useAuth();
  const isResponsable = hasRole("admin") || hasRole("responsable_inventaire");
  const isAgent = hasRole("agent_inventaire") || isResponsable;

  const inventoryRoles = new Set(["responsable_inventaire", "agent_inventaire"]);
  const isInventoryOnly =
    roles.length > 0 &&
    !roles.includes("admin") &&
    roles.every((r) => inventoryRoles.has(r as string));

  return {
    isResponsable,
    isAgent,
    canManage: isResponsable,
    canCount: isAgent,
    isInventoryOnly,
  };
}
