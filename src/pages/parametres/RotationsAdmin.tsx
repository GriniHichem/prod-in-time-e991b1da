import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CalendarClock, Users, UserCog, Layers, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { TeamsTab } from "@/components/parametres/rotations/TeamsTab";
import { MembersTab } from "@/components/parametres/rotations/MembersTab";
import { ModesTab } from "@/components/parametres/rotations/ModesTab";
import { RulesTab } from "@/components/parametres/rotations/RulesTab";

/**
 * Module unifié "Shifts & Rotations" — moteur de rotation par employé.
 *   - shift_teams        : équipes
 *   - shift_modes        : systèmes de production (3×8, 2×8, 1×8, 2×12, Surface) + créneaux
 *   - shift_team_members : membre = système assigné + motif de cycle + date d'ancrage + périmètre + autorisation libre
 *   - shift_settings     : règles et paramètres
 * Le créneau attendu d'un employé à une date donnée est calculé en bouclant son
 * motif depuis la date d'ancrage (Surface = logique fixe 5/7 lun-ven).
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
          <h1 className="text-2xl font-bold">Shifts &amp; Rotations</h1>
          <p className="text-sm text-muted-foreground">
            Équipes, membres, autorisations, modèles, plannings, systèmes &amp; règles
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 md:p-6">
          <Tabs defaultValue="teams" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="teams"><Users className="h-4 w-4 mr-2" /> Équipes</TabsTrigger>
              <TabsTrigger value="modes"><Layers className="h-4 w-4 mr-2" /> Systèmes de production</TabsTrigger>
              <TabsTrigger value="members"><UserCog className="h-4 w-4 mr-2" /> Membres &amp; Motifs</TabsTrigger>
              <TabsTrigger value="rules"><Settings className="h-4 w-4 mr-2" /> Règles</TabsTrigger>
            </TabsList>
            <TabsContent value="teams"><TeamsTab /></TabsContent>
            <TabsContent value="modes"><ModesTab /></TabsContent>
            <TabsContent value="members"><MembersTab /></TabsContent>
            <TabsContent value="rules"><RulesTab /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
