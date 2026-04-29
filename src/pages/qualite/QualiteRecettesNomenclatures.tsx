import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecipesQualityTab from "./components/RecipesQualityTab";
import BomTab from "./components/BomTab";
import BomCompareTab from "./components/BomCompareTab";
import QualitySensitiveItemsTab from "./components/QualitySensitiveItemsTab";

export default function QualiteRecettesNomenclatures() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Recettes & Nomenclatures (Qualité)</h1>
        <p className="text-muted-foreground">Recettes (composition + process) et Nomenclatures (BOM) gérées séparément</p>
      </div>

      <Tabs defaultValue="recipes" className="w-full">
        <TabsList className="h-12">
          <TabsTrigger value="recipes" className="px-4">Recettes</TabsTrigger>
          <TabsTrigger value="bom" className="px-4">Nomenclatures</TabsTrigger>
          <TabsTrigger value="compare" className="px-4">Comparaison</TabsTrigger>
          <TabsTrigger value="sensitive" className="px-4">Articles qualité sensibles</TabsTrigger>
        </TabsList>
        <TabsContent value="recipes" className="mt-4"><RecipesQualityTab /></TabsContent>
        <TabsContent value="bom" className="mt-4"><BomTab /></TabsContent>
        <TabsContent value="compare" className="mt-4"><BomCompareTab /></TabsContent>
        <TabsContent value="sensitive" className="mt-4"><QualitySensitiveItemsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
