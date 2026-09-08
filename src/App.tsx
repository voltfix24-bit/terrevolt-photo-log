import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppHeader from "@/components/AppHeader";
import Index from "./pages/Index";
import NewStation from "./pages/NewStation";
import StationDetail from "./pages/StationDetail";
import Instellingen from "./pages/Instellingen";
import CategorieenBeheren from "./pages/CategorieenBeheren";
import Opleveren from "./pages/Opleveren";
import Beoordelen from "./pages/Beoordelen";
import BeoordeelDossier from "./pages/BeoordeelDossier";
import Auth from "./pages/Auth";
import RequireAuth from "@/components/RequireAuth";
import NotFound from "./pages/NotFound";
import { useInstellingen } from "@/hooks/use-theme";
import { useOnline } from "@/hooks/use-online";
import { syncPendingPhotos } from "@/lib/sync-service";
import { getQueueCount } from "@/lib/offline-queue";
import { toast } from "sonner";
import { useEffect } from "react";

const queryClient = new QueryClient();

function AppContent() {
  useInstellingen();
  const isOnline = useOnline();

  useEffect(() => {
    if (isOnline) {
      getQueueCount().then(count => {
        if (count > 0) {
          toast.loading(`Verbinding hersteld — ${count} foto's uploaden...`, { id: 'sync-toast' });
          syncPendingPhotos((done, total) => {
            toast.loading(`${done}/${total} foto's uploaden...`, { id: 'sync-toast' });
          }).then(done => {
            if (done > 0) {
              toast.success(`${done} foto's gesynchroniseerd ✓`, { id: 'sync-toast' });
              queryClient.invalidateQueries({ queryKey: ["fotos"] });
              queryClient.invalidateQueries({ queryKey: ["stations"] });
            } else {
              toast.dismiss('sync-toast');
            }
          });
        }
      });
    }
  }, [isOnline]);

  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/stations/new" element={<NewStation />} />
        <Route path="/stations/:id" element={<StationDetail />} />
        <Route path="/stations/:id/opleveren" element={<Opleveren />} />
        <Route path="/beoordelen" element={<Beoordelen />} />
        <Route path="/beoordelen/:id" element={<BeoordeelDossier />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="/instellingen/categorieen" element={<CategorieenBeheren />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
