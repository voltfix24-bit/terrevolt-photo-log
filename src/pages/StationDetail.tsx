import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FOTO_CATEGORIEEN, slugify } from "@/lib/categories";
import { ArrowLeft, FileDown, Check, Upload, Trash2, Loader2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useRef, useState } from "react";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED = ["image/jpeg", "image/png", "image/heic", "image/webp"];

export default function StationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);

  const { data: station, isLoading } = useQuery({
    queryKey: ["station", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: fotos } = useQuery({
    queryKey: ["fotos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fotos")
        .select("*")
        .eq("station_id", id!)
        .order("volgorde", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const fotosByCategorie = (cat: string) =>
    fotos?.filter((f) => f.categorie === cat) ?? [];

  const filledCount = new Set(fotos?.map((f) => f.categorie)).size;

  const handleUpload = async (categorie: string, files: FileList) => {
    setUploadingCat(categorie);
    const catSlug = slugify(categorie);

    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is groter dan 10MB`);
        continue;
      }
      if (!ACCEPTED.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
        toast.error(`${file.name}: ongeldig bestandstype`);
        continue;
      }

      const storagePath = `stations/${id}/${catSlug}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("to-fotos")
        .upload(storagePath, file);

      if (uploadError) {
        toast.error(`Upload mislukt: ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("to-fotos")
        .getPublicUrl(storagePath);

      const { error: dbError } = await supabase.from("fotos").insert({
        station_id: id!,
        categorie,
        storage_path: storagePath,
        url: urlData.publicUrl,
        volgorde: fotosByCategorie(categorie).length,
      });

      if (dbError) {
        toast.error(`Database fout: ${dbError.message}`);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    setUploadingCat(null);
    toast.success("Foto's geüpload");
  };

  const handleDelete = async (fotoId: string, storagePath: string) => {
    await supabase.storage.from("to-fotos").remove([storagePath]);
    await supabase.from("fotos").delete().eq("id", fotoId);
    queryClient.invalidateQueries({ queryKey: ["fotos", id] });
    queryClient.invalidateQueries({ queryKey: ["stations"] });
    toast.success("Foto verwijderd");
  };

  const openPdf = () => {
    window.open(`/stations/${id}/pdf`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!station) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Station niet gevonden
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="container mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-lg font-bold text-foreground">{station.naam_msr}</h1>
                <p className="text-xs text-muted-foreground">
                  {station.behuizingsnummer && `${station.behuizingsnummer} · `}
                  {station.type_ruimte}
                </p>
              </div>
            </div>
            <Button onClick={openPdf} size="sm" variant="outline">
              <FileDown className="mr-1.5 h-4 w-4" />
              PDF
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filledCount}/{FOTO_CATEGORIEEN.length} categorieën</span>
            <Progress value={(filledCount / FOTO_CATEGORIEEN.length) * 100} className="h-1.5 flex-1" />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FOTO_CATEGORIEEN.map((cat, i) => {
            const catFotos = fotosByCategorie(cat);
            const hasFotos = catFotos.length > 0;
            const isUploading = uploadingCat === cat;

            return (
              <CategoryCard
                key={cat}
                index={i}
                categorie={cat}
                fotos={catFotos}
                hasFotos={hasFotos}
                isUploading={isUploading}
                onUpload={(files) => handleUpload(cat, files)}
                onDelete={handleDelete}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

interface CategoryCardProps {
  index: number;
  categorie: string;
  fotos: Array<{ id: string; url: string; storage_path: string }>;
  hasFotos: boolean;
  isUploading: boolean;
  onUpload: (files: FileList) => void;
  onDelete: (id: string, storagePath: string) => void;
}

function CategoryCard({ index, categorie, fotos, hasFotos, isUploading, onUpload, onDelete }: CategoryCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
            {index + 1}
          </span>
          <h3 className="text-sm font-medium text-foreground leading-tight">{categorie}</h3>
        </div>
        {hasFotos && (
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/20">
            <Check className="h-3 w-3 text-green-400" />
          </div>
        )}
      </div>

      {fotos.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-1">
          {fotos.map((foto) => (
            <div key={foto.id} className="group relative aspect-square overflow-hidden rounded-md">
              <img src={foto.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => onDelete(foto.id, foto.storage_path)}
                className="absolute inset-0 flex items-center justify-center bg-background/70 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/webp"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && onUpload(e.target.files)}
      />
      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        disabled={isUploading}
        onClick={() => fileRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
        ) : (
          <Camera className="mr-1.5 h-3 w-3" />
        )}
        {isUploading ? "Uploaden..." : "Foto's toevoegen"}
      </Button>
    </div>
  );
}
