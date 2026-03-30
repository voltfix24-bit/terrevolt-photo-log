import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN } from "@/lib/categories";
import { Search, Plus, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: stations, isLoading } = useQuery({
    queryKey: ["stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*, fotos(categorie)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = stations?.filter(
    (s) =>
      s.naam_msr.toLowerCase().includes(search.toLowerCase()) ||
      s.behuizingsnummer?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="container mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">TO Foto's</h1>
              <p className="text-xs text-muted-foreground">Terrevolt B.V.</p>
            </div>
          </div>
          <Button onClick={() => navigate("/stations/new")} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nieuw station
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:px-6">
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Zoek op naam MSR of behuizingsnummer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5">
                <Skeleton className="mb-3 h-5 w-3/4" />
                <Skeleton className="mb-2 h-4 w-1/2" />
                <Skeleton className="mb-3 h-6 w-20" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Zap className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">Nog geen stations</p>
            <p className="text-sm">Maak een nieuw station aan om te beginnen</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered?.map((station) => {
              const uniqueCategories = new Set(
                station.fotos?.map((f: { categorie: string }) => f.categorie)
              );
              const progress = (uniqueCategories.size / FOTO_CATEGORIEEN.length) * 100;

              return (
                <button
                  key={station.id}
                  onClick={() => navigate(`/stations/${station.id}`)}
                  className="rounded-xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/50"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground">{station.naam_msr}</h3>
                    <Badge
                      variant={station.type_ruimte === "Compact Station" ? "default" : "secondary"}
                      className={
                        station.type_ruimte === "Compact Station"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-secondary/15 text-secondary-foreground border-secondary/30"
                      }
                    >
                      {station.type_ruimte === "Compact Station" ? "CS" : "BS"}
                    </Badge>
                  </div>
                  {station.behuizingsnummer && (
                    <p className="mb-2 font-mono text-sm text-muted-foreground">
                      {station.behuizingsnummer}
                    </p>
                  )}
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{station.datum}</span>
                    <span>{uniqueCategories.size} / {FOTO_CATEGORIEEN.length} categorieën</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
