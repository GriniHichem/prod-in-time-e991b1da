import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CalendarClock, Users, UserCog, LayoutGrid, CalendarRange } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TeamsTab } from "@/components/parametres/rotations/TeamsTab";
import { MembersTab } from "@/components/parametres/rotations/MembersTab";
import { TemplatesTab } from "@/components/parametres/rotations/TemplatesTab";
import { SchedulesTab } from "@/components/parametres/rotations/SchedulesTab";

/**
 * Unified "Équipes & Rotations" management module (phase 2).
 * Team-based shift engine:
 *   - shift_teams        : équipes
 *   - shift_team_members : appartenance + autorisation libre
 *   - shift_templates    : modèles de créneaux réutilisables
 *   - shift_schedules    : plannings équipe ↔ modèle (portée + lignes + jours)
 */
export default function RotationsAdmin() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();

  const canManage =
    hasRole("admin") ||
    hasRole("resp_maintenance") ||
    hasRole("resp_production") ||
    hasRole("responsable_controle_qualite") ||
    hasRole("directeur_qualite");

  if (!canManage) {
    return <div className="p-8 text-muted-foreground">Accès réservé aux responsables.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <CalendarClock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Équipes &amp; Rotations</h1>
          <p className="text-sm text-muted-foreground">
            Équipes, membres, modèles de shift &amp; plannings de rotation
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 md:p-6">
          <Tabs defaultValue="teams" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="teams"><Users className="h-4 w-4 mr-2" /> Équipes</TabsTrigger>
              <TabsTrigger value="members"><UserCog className="h-4 w-4 mr-2" /> Membres</TabsTrigger>
              <TabsTrigger value="templates"><LayoutGrid className="h-4 w-4 mr-2" /> Modèles</TabsTrigger>
              <TabsTrigger value="schedules"><CalendarRange className="h-4 w-4 mr-2" /> Plannings</TabsTrigger>
            </TabsList>
            <TabsContent value="teams"><TeamsTab /></TabsContent>
            <TabsContent value="members"><MembersTab /></TabsContent>
            <TabsContent value="templates"><TemplatesTab /></TabsContent>
            <TabsContent value="schedules"><SchedulesTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
