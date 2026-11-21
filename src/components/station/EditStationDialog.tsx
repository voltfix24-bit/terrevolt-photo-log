import { zorgVoorBeheer } from "@/lib/require-pin";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { internetVereist } from "@/lib/internet";
import { KnopLader } from "@/components/Laden";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EditStationDialogProps {
  station: { id: string; naam_msr: string; behuizingsnummer: string | null; casenummer: string | null; casenaam: string | null; type_ruimte: string | null; ingevuld_door: string | null; datum: string | null; status?: string | null; submitted_at?: string | null };
  open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void;
}

export function EditStationDialog({ station, open, onOpenChange, onSaved }: EditStationDialogProps) {
  const [form, setForm] = useState({ naam_msr: station.naam_msr, behuizingsnummer: station.behuizingsnummer || "", casenummer: station.casenummer || "", casenaam: station.casenaam || "", type_ruimte: station.type_ruimte || "", ingevuld_door: station.ingevuld_door || "", datum: station.datum || "" });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!internetVereist()) return;
    if ((!["concept", "in uitvoering"].includes(station.status ?? "") || station.submitted_at) && !await zorgVoorBeheer()) return;
    setSaving(true);
    const { data, error } = await supabase.from("stations").update({ naam_msr: form.naam_msr, behuizingsnummer: form.behuizingsnummer || null, casenummer: form.casenummer || null, casenaam: form.casenaam || null, type_ruimte: form.type_ruimte, ingevuld_door: form.ingevuld_door || null, datum: form.datum || null }).eq("id", station.id).select("id");
    setSaving(false);
    if (error || !data?.length) { toast.error("Opslaan geweigerd — controleer de beheerstatus"); } else { toast.success("Station bijgewerkt"); onSaved(); onOpenChange(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Station bewerken</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Naam MSR</Label><input value={form.naam_msr} onChange={(e) => setForm({ ...form, naam_msr: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Behuizingsnummer</Label><input value={form.behuizingsnummer} onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Casenummer</Label><input value={form.casenummer} onChange={(e) => setForm({ ...form, casenummer: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Casenaam</Label><input value={form.casenaam} onChange={(e) => setForm({ ...form, casenaam: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Type ruimte</Label><Select value={form.type_ruimte} onValueChange={(v) => setForm({ ...form, type_ruimte: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Compact Station">Compact Station</SelectItem><SelectItem value="Betreedbaar station">Betreedbaar station</SelectItem></SelectContent></Select></div>
          <div><Label>Ingevuld door</Label><input value={form.ingevuld_door} onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <div><Label>Datum</Label><input type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} className="w-full px-4 py-3 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition" /></div>
          <button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-bold py-3 rounded-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-50">
            {saving ? <span className="inline-flex items-center justify-center gap-2"><KnopLader />Opslaan</span> : "Opslaan"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
