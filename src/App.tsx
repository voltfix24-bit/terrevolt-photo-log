import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SharePointSleutelBanner } from "@/components/SharePointSleutelBanner";
import AppHeader from "@/components/AppHeader";
import Index from "./pages/Index";
import NewStation from "./pages/NewStation";
import Instellingen from "./pages/Instellingen";
import CategorieenBeheren from "./pages/CategorieenBeheren";
import Beoordelen from "./pages/Beoordelen";
import Cases from "./pages/Cases";
import NotFound from "./pages/NotFound";
import { BeoordelenSleutelRoute, CasesSleutelRoute, KorteLink, OpdrachtgeverRoute, StationsRoute } from "./pages/UrlRoutes";
import { useInstellingen } from "@/hooks/use-theme";
import { useOnline } from "@/hooks/use-online";
import { syncPendingPhotos } from "@/lib/sync-service";
import { getQueueCount } from "@/lib/offline-queue";
import { verstuurNotities } from "@/lib/notities";
import { toast } from "sonner";
import { useEffect } from "react";

const queryClient = new QueryClient();

function AppContent() {
  useInstellingen();
  const isOnline = useOnline();

  useEffect(() => {
    if (isOnline) {
      verstuurNotities().then(n => { if (n > 0) queryClient.invalidateQueries({ queryKey: ["opmerkingen"] }); });
      getQueueCount().then(count => {
        if (count > 0) {
          toast.loading(`Verbinding hersteld — ${count} foto's uploaden...`, { id: 'sync-toast' });
          syncPendingPhotos((done, total) => {
            toast.loading(`${done}/${total} foto's uploaden...`, { id: 'sync-toast' });
          }).then(({ gelukt, mislukt }) => {
            if (gelukt > 0) {
              queryClient.invalidateQueries({ queryKey: ["fotos"] });
              queryClient.invalidateQueries({ queryKey: ["stations"] });
            }
            if (mislukt > 0) {
              toast.error(`${mislukt} foto${mislukt > 1 ? "'s" : ""} nog niet geüpload${gelukt ? ` (${gelukt} wel)` : ""} — blijft bewaard en wordt later opnieuw geprobeerd`, { id: 'sync-toast', duration: 8000 });
            } else if (gelukt > 0) {
              toast.success(`${gelukt} foto's gesynchroniseerd ✓`, { id: 'sync-toast' });
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
      <SharePointSleutelBanner />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/stations/new" element={<NewStation />} />
        <Route path="/stations/:key/*" element={<StationsRoute />} />
        <Route path="/beoordelen" element={<Beoordelen />} />
        <Route path="/beoordelen/:key" element={<BeoordelenSleutelRoute />} />
        <Route path="/instellingen" element={<Instellingen />} />
        <Route path="/instellingen/categorieen" element={<CategorieenBeheren />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/cases/:key" element={<CasesSleutelRoute />} />
        <Route path="/c/:nr" element={<KorteLink />} />
        {/* Leesbare urls zoals de SharePoint-mappen; vaste routes hierboven gaan voor */}
        <Route path="/:og" element={<OpdrachtgeverRoute />} />
        <Route path="/:og/:jaar" element={<OpdrachtgeverRoute />} />
        <Route path="/:og/:jaar/:case/*" element={<OpdrachtgeverRoute />} />
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
