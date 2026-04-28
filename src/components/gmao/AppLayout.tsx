import { Outlet } from "react-router-dom";
import { AppTopBar } from "./AppTopBar";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col w-full bg-background">
      <AppTopBar />
      <main className="flex-1 overflow-auto px-3 py-4 md:px-5 md:py-5 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
