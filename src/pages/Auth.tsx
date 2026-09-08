import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [modus, setModus] = useState<"in" | "aan">("in");
  const [email, setEmail] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [bezig, setBezig] = useState(false);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    try {
      if (modus === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord });
        if (error) throw error;
        navigate(from, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: wachtwoord,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate(from, { replace: true });
        else toast.success("Bevestig je e-mail om het account te activeren.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Er ging iets mis";
      toast.error(msg);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: "#E8F2E2" }}>
      <form
        onSubmit={verstuur}
        className="w-full max-w-sm bg-white p-6"
        style={{ borderRadius: 16 }}
      >
        <h1 className="text-[22px] font-semibold mb-1" style={{ color: "#0A2A18" }}>
          {modus === "in" ? "Inloggen" : "Account maken"}
        </h1>
        <p className="text-sm mb-5" style={{ color: "#5E7A66" }}>
          Bekijken kan zonder account. Voor invullen en wijzigen is inloggen nodig.
        </p>

        <label className="block text-sm mb-1" style={{ color: "#3D4F42" }} htmlFor="email">E-mailadres</label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 text-[16px] outline-none"
          style={{ height: 48, borderRadius: 12, background: "#F2F6F1", color: "#0A0A0A" }}
        />

        <label className="block text-sm mb-1" style={{ color: "#3D4F42" }} htmlFor="ww">Wachtwoord</label>
        <input
          id="ww"
          type="password"
          required
          minLength={6}
          autoComplete={modus === "in" ? "current-password" : "new-password"}
          value={wachtwoord}
          onChange={(e) => setWachtwoord(e.target.value)}
          className="w-full mb-5 px-3 text-[16px] outline-none"
          style={{ height: 48, borderRadius: 12, background: "#F2F6F1", color: "#0A0A0A" }}
        />

        <button
          type="submit"
          disabled={bezig}
          className="w-full text-white font-medium disabled:opacity-60"
          style={{ height: 52, borderRadius: 14, background: "#1F5C3A" }}
        >
          {bezig ? "Even geduld…" : modus === "in" ? "Inloggen" : "Account maken"}
        </button>

        <button
          type="button"
          onClick={() => setModus(modus === "in" ? "aan" : "in")}
          className="w-full mt-4 text-sm"
          style={{ color: "#1F5C3A" }}
        >
          {modus === "in" ? "Nog geen account? Account maken" : "Al een account? Inloggen"}
        </button>
      </form>
    </div>
  );
}
