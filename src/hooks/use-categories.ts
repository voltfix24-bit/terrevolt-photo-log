import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES, Category } from "@/lib/categories";
import { toast } from "sonner";

export interface CategoryOverride {
  id: string;
  categorie_id: number;
  naam: string | null;
  instructie: string | null;
  tip: string | null;
  volgorde: number | null;
}

export interface MergedCategory extends Category {
  /** The DB override row, if any */
  override?: CategoryOverride;
  /** Effective values after merging */
  effectiveName: string;
  effectiveInstruction: string;
  effectiveTip: string;
  effectiveOrder: number;
}

const QUERY_KEY = ["categorie_instellingen"];

export function useCategoryOverrides() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorie_instellingen")
        .select("*")
        .order("categorie_id", { ascending: true });
      if (error) throw error;
      return data as CategoryOverride[];
    },
  });
}

export function useMergedCategories(): { categories: MergedCategory[]; isLoading: boolean } {
  const { data: overrides, isLoading } = useCategoryOverrides();

  const overrideMap = new Map<number, CategoryOverride>();
  overrides?.forEach((o) => overrideMap.set(o.categorie_id, o));

  const merged: MergedCategory[] = CATEGORIES.map((cat) => {
    const override = overrideMap.get(cat.id);
    return {
      ...cat,
      override,
      effectiveName: override?.naam || cat.name,
      effectiveInstruction: override?.instructie || cat.instruction,
      effectiveTip: override?.tip || cat.tip || "",
      effectiveOrder: override?.volgorde ?? cat.id,
    };
  });

  merged.sort((a, b) => a.effectiveOrder - b.effectiveOrder);

  return { categories: merged, isLoading };
}

export function useSaveCategoryOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      categorie_id: number;
      naam?: string;
      instructie?: string;
      tip?: string;
      volgorde?: number;
    }) => {
      // Upsert based on categorie_id
      const { data: existing } = await supabase
        .from("categorie_instellingen")
        .select("id")
        .eq("categorie_id", params.categorie_id)
        .maybeSingle();

      if (existing) {
        const updateData: Record<string, unknown> = {};
        if (params.naam !== undefined) updateData.naam = params.naam || null;
        if (params.instructie !== undefined) updateData.instructie = params.instructie || null;
        if (params.tip !== undefined) updateData.tip = params.tip || null;
        if (params.volgorde !== undefined) updateData.volgorde = params.volgorde;
        updateData.updated_at = new Date().toISOString();

        const { error } = await supabase
          .from("categorie_instellingen")
          .update(updateData)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("categorie_instellingen").insert({
          categorie_id: params.categorie_id,
          naam: params.naam || null,
          instructie: params.instructie || null,
          tip: params.tip || null,
          volgorde: params.volgorde ?? params.categorie_id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => {
      toast.error(`Opslaan mislukt: ${err.message}`);
    },
  });
}

export function useBulkUpdateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { categorie_id: number; volgorde: number }[]) => {
      for (const u of updates) {
        const { data: existing } = await supabase
          .from("categorie_instellingen")
          .select("id")
          .eq("categorie_id", u.categorie_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("categorie_instellingen")
            .update({ volgorde: u.volgorde, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("categorie_instellingen").insert({
            categorie_id: u.categorie_id,
            volgorde: u.volgorde,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Volgorde opgeslagen ✓");
    },
    onError: (err: Error) => {
      toast.error(`Volgorde opslaan mislukt: ${err.message}`);
    },
  });
}
