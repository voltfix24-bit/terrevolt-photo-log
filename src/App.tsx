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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AppHeader />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/stations/new" element={<NewStation />} />
          <Route path="/stations/:id" element={<StationDetail />} />
          <Route path="/instellingen" element={<Instellingen />} />
          <Route path="/instellingen/categorieen" element={<CategorieenBeheren />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
