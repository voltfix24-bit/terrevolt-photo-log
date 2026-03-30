import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function NewStation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    naam_msr: "",
    behuizingsnummer: "",
    type_ruimte: "",
    ingevuld_door: "",
    datum: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.naam_msr || !form.type_ruimte) {
      toast.error("Vul minimaal de naam MSR en type ruimte in");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("stations")
      .insert({
        naam_msr: form.naam_msr,
        behuizingsnummer: form.behuizingsnummer || null,
        type_ruimte: form.type_ruimte,
        ingevuld_door: form.ingevuld_door || null,
        datum: form.datum || null,
      })
      .select()
      .single();

    setLoading(false);
    if (error) {
      toast.error("Fout bij opslaan: " + error.message);
    } else {
      toast.success("Station aangemaakt");
      navigate(`/stations/${data.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="container mx-auto flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Nieuw station</h1>
        </div>
      </header>

      <main className="container mx-auto max-w-lg px-4 py-6 sm:px-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Naam MSR *</Label>
            <Input
              value={form.naam_msr}
              onChange={(e) => setForm({ ...form, naam_msr: e.target.value })}
              placeholder="bijv. MSR-12345"
            />
          </div>
          <div>
            <Label>Behuizingsnummer</Label>
            <Input
              value={form.behuizingsnummer}
              onChange={(e) => setForm({ ...form, behuizingsnummer: e.target.value })}
              placeholder="bijv. BH-001"
            />
          </div>
          <div>
            <Label>Type ruimte *</Label>
            <Select value={form.type_ruimte} onValueChange={(v) => setForm({ ...form, type_ruimte: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Compact Station">Compact Station</SelectItem>
                <SelectItem value="Betreedbaar station">Betreedbaar station</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ingevuld door</Label>
            <Input
              value={form.ingevuld_door}
              onChange={(e) => setForm({ ...form, ingevuld_door: e.target.value })}
              placeholder="Naam monteur"
            />
          </div>
          <div>
            <Label>Datum</Label>
            <Input
              type="date"
              value={form.datum}
              onChange={(e) => setForm({ ...form, datum: e.target.value })}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Station aanmaken
          </Button>
        </form>
      </main>
    </div>
  );
}
