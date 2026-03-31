import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useInstellingen, DEFAULT_THEME, applyTheme, type AppInstellingen } from '@/hooks/use-theme';

const COLOR_PRESETS = [
  {
    name: 'TerreVolt Groen',
    primary: '150 100% 20%',
    light: '140 65% 66%',
    bg: '116 90% 96%',
    gold: '44 100% 23%',
    orange: '15 82% 50%',
  },
  {
    name: 'Ocean Blauw',
    primary: '210 100% 25%',
    light: '210 80% 55%',
    bg: '210 80% 97%',
    gold: '44 100% 23%',
    orange: '15 82% 50%',
  },
  {
    name: 'Slate Grijs',
    primary: '220 20% 25%',
    light: '220 15% 55%',
    bg: '220 20% 97%',
    gold: '44 100% 23%',
    orange: '15 82% 50%',
  },
  {
    name: 'Terracotta',
    primary: '15 60% 30%',
    light: '15 50% 55%',
    bg: '15 40% 97%',
    gold: '44 100% 23%',
    orange: '25 90% 50%',
  },
];

const ACCESS_CODE = '24491';

export default function Instellingen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: instellingen } = useInstellingen();
  const logoRef = useRef<HTMLInputElement>(null);
  const profielRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingProfiel, setUploadingProfiel] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [form, setForm] = useState<Partial<AppInstellingen>>({});
  const current = { ...instellingen, ...form } as AppInstellingen;

  const handlePinSubmit = () => {
    if (pinInput === ACCESS_CODE) {
      setUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary font-semibold transition-colors mb-8"
          >
            <span className="material-symbols-rounded text-lg">arrow_back_ios</span>
            Terug
          </button>
          <div className="bg-card rounded-3xl shadow-lg border border-outline-variant/10 p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-rounded text-primary text-[28px]">lock</span>
            </div>
            <h2 className="font-display text-xl font-extrabold text-on-surface mb-1">Instellingen</h2>
            <p className="text-sm text-muted-foreground mb-6">Voer de toegangscode in om verder te gaan</p>
            <form onSubmit={(e) => { e.preventDefault(); handlePinSubmit(); }}>
              <input
                type="password"
                inputMode="numeric"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                placeholder="Toegangscode"
                autoFocus
                className={`w-full px-4 py-3.5 bg-surface-low border rounded-xl text-center text-lg font-bold
                           tracking-[0.3em] focus:outline-none focus:ring-2 transition ${
                  pinError
                    ? 'border-orange ring-orange/25 animate-shake'
                    : 'border-outline-variant/30 focus:ring-primary/25'
                }`}
              />
              {pinError && (
                <p className="text-sm text-orange font-semibold mt-2">Onjuiste code</p>
              )}
              <button
                type="submit"
                className="w-full mt-4 min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground
                           rounded-xl font-display font-bold text-[15px] shadow-md shadow-primary/20
                           active:scale-[0.97] transition-all"
              >
                Ontgrendelen
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const updateField = (key: keyof AppInstellingen, value: string) => {
    const updated = { ...form, [key]: value };
    setForm(updated);
    applyTheme({ ...instellingen, ...updated });
  };

  const handleSave = async () => {
    if (!instellingen?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('instellingen')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', instellingen.id);
    setSaving(false);
    if (error) { toast.error('Opslaan mislukt'); return; }
    queryClient.invalidateQueries({ queryKey: ['instellingen'] });
    setForm({});
    toast.success('Instellingen opgeslagen ✓');
  };

  const handleReset = async () => {
    if (!instellingen?.id) return;
    const resetData = {
      primary_color: DEFAULT_THEME.primary_color,
      primary_light_color: DEFAULT_THEME.primary_light_color,
      background_color: DEFAULT_THEME.background_color,
      accent_gold_color: DEFAULT_THEME.accent_gold_color,
      orange_color: DEFAULT_THEME.orange_color,
    };
    const { error } = await supabase
      .from('instellingen')
      .update(resetData)
      .eq('id', instellingen.id);
    if (!error) {
      setForm({});
      applyTheme(DEFAULT_THEME);
      queryClient.invalidateQueries({ queryKey: ['instellingen'] });
      toast.success('Kleuren teruggezet naar standaard');
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (!instellingen?.id) return;
    setUploadingLogo(true);
    const path = `branding/logo_${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('branding').upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from('branding').getPublicUrl(path);
      await supabase.from('instellingen').update({ logo_url: data.publicUrl }).eq('id', instellingen.id);
      queryClient.invalidateQueries({ queryKey: ['instellingen'] });
      toast.success('Logo opgeslagen ✓');
    } else {
      toast.error('Upload mislukt');
    }
    setUploadingLogo(false);
  };

  const handleProfielUpload = async (file: File) => {
    if (!instellingen?.id) return;
    setUploadingProfiel(true);
    const path = `branding/profiel_${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('branding').upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from('branding').getPublicUrl(path);
      await supabase.from('instellingen' as any).update({ profielfoto_url: data.publicUrl } as any).eq('id', instellingen.id);
      queryClient.invalidateQueries({ queryKey: ['instellingen'] });
      toast.success('Profielfoto opgeslagen ✓');
    } else {
      toast.error('Upload mislukt');
    }
    setUploadingProfiel(false);
  };

  const hasChanges = Object.keys(form).length > 0;

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-8">
      <main className="pt-24 pb-8 px-5 max-w-lg mx-auto animate-fade-up">
        {/* Back */}
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary font-semibold transition-colors mb-4">
          <span className="material-symbols-rounded text-lg">arrow_back_ios</span>
          Terug
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary-light flex items-center justify-center text-primary-foreground text-lg font-black shadow-lg shadow-primary/30 overflow-hidden">
            {current?.profielfoto_url ? (
              <img src={current.profielfoto_url} className="w-full h-full object-cover" alt="" />
            ) : 'TV'}
          </div>
          <div>
            <h1 className="font-display text-2xl font-black text-on-surface">Instellingen</h1>
            <p className="text-sm text-muted-foreground">{current?.bedrijfsnaam} · {current?.regio}</p>
          </div>
        </div>

        {/* ── BRANDING ── */}
        <div className="bg-card rounded-2xl border border-outline-variant/10 shadow-sm mb-4 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-outline-variant/10">
            <h2 className="font-display font-bold text-[15px] text-on-surface">Huisstijl</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Logo, profielfoto en bedrijfsnaam</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Logo + Profielfoto row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Logo */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Bedrijfslogo</div>
                <button
                  type="button"
                  onClick={() => logoRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full h-24 rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-low flex flex-col items-center justify-center gap-1.5 hover:border-primary/40 hover:bg-primary/[0.05] transition-all active:scale-[0.98] overflow-hidden relative"
                >
                  {current?.logo_url ? (
                    <img src={current.logo_url} className="w-full h-full object-contain p-2" alt="Logo" />
                  ) : (
                    <>
                      <span className="material-symbols-rounded text-muted-foreground text-xl">
                        {uploadingLogo ? 'hourglass_empty' : 'add_photo_alternate'}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {uploadingLogo ? 'Uploaden...' : 'Logo uploaden'}
                      </span>
                    </>
                  )}
                </button>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              </div>

              {/* Profielfoto */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Profielfoto</div>
                <button
                  type="button"
                  onClick={() => profielRef.current?.click()}
                  disabled={uploadingProfiel}
                  className="w-full h-24 rounded-2xl border-2 border-dashed border-outline-variant/40 bg-surface-low flex flex-col items-center justify-center gap-1.5 hover:border-primary/40 hover:bg-primary/[0.05] transition-all active:scale-[0.98] overflow-hidden relative"
                >
                  {current?.profielfoto_url ? (
                    <img src={current.profielfoto_url} className="w-full h-full object-cover" alt="Profiel" />
                  ) : (
                    <>
                      <span className="material-symbols-rounded text-muted-foreground text-xl">
                        {uploadingProfiel ? 'hourglass_empty' : 'person_add'}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">
                        {uploadingProfiel ? 'Uploaden...' : 'Foto uploaden'}
                      </span>
                    </>
                  )}
                </button>
                <input ref={profielRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleProfielUpload(e.target.files[0])} />
              </div>
            </div>

            {/* Bedrijfsnaam + Regio */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Bedrijfsnaam</label>
                <input
                  value={current?.bedrijfsnaam || ''}
                  onChange={e => updateField('bedrijfsnaam', e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Regio</label>
                <input
                  value={current?.regio || ''}
                  onChange={e => updateField('regio', e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-low border border-outline-variant/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── KLEUREN ── */}
        <div className="bg-card rounded-2xl border border-outline-variant/10 shadow-sm mb-4 overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-outline-variant/10 flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-[15px] text-on-surface">Kleuren</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pas de huisstijlkleuren aan</p>
            </div>
            <button onClick={handleReset} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors active:scale-95">
              <span className="material-symbols-rounded text-sm">restart_alt</span>
              Reset
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Color presets */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Snelle keuze</div>
              <div className="grid grid-cols-2 gap-2">
                {COLOR_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      const updated: Partial<AppInstellingen> = {
                        primary_color: preset.primary,
                        primary_light_color: preset.light,
                        background_color: preset.bg,
                        accent_gold_color: preset.gold,
                        orange_color: preset.orange,
                      };
                      setForm(prev => ({ ...prev, ...updated }));
                      applyTheme(updated);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-low hover:border-primary/40 transition-all active:scale-[0.98]"
                  >
                    <div className="flex -space-x-1">
                      <div className="w-5 h-5 rounded-full border-2 border-card" style={{ background: `hsl(${preset.primary})` }} />
                      <div className="w-5 h-5 rounded-full border-2 border-card" style={{ background: `hsl(${preset.light})` }} />
                    </div>
                    <span className="text-xs font-semibold text-on-surface">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual color inputs */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Handmatig aanpassen (HSL)</div>
              <div className="space-y-2">
                {([
                  { key: 'primary_color' as const, label: 'Primaire kleur', desc: 'Knoppen, links' },
                  { key: 'primary_light_color' as const, label: 'Primaire kleur licht', desc: 'Gradients, progress' },
                  { key: 'background_color' as const, label: 'Achtergrond', desc: 'Pagina achtergrond' },
                  { key: 'orange_color' as const, label: 'Accent oranje', desc: 'OPEN badges, waarschuwingen' },
                ]).map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center gap-3 px-3 py-2.5 bg-surface-low rounded-xl">
                    <div className="w-8 h-8 rounded-lg border border-outline-variant/30 flex-shrink-0" style={{ background: `hsl(${(current as any)?.[key] || ''})` }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-on-surface">{label}</div>
                      <div className="text-[10px] text-muted-foreground">{desc}</div>
                    </div>
                    <input
                      value={(current as any)?.[key] || ''}
                      onChange={e => updateField(key, e.target.value)}
                      placeholder="150 100% 20%"
                      className="w-28 px-2.5 py-2 bg-card border border-outline-variant/30 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/25 transition"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Live preview strip */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Live preview</div>
              <div className="flex items-center gap-2 p-3 bg-surface-low rounded-xl">
                <button type="button" className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold">
                  Primaire knop
                </button>
                <span className="text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full bg-orange/10 text-orange">OPEN</span>
                <span className="text-[9px] font-black uppercase tracking-wide text-primary">KLAAR</span>
                <div className="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-primary to-primary-light" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── BEHEER ── */}
        <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-2 mt-6">Beheer</div>
        <div className="space-y-3 mb-6">
          <button
            onClick={() => navigate("/instellingen/categorieen")}
            className="w-full bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm flex items-center justify-between hover:shadow-md transition-all active:scale-[0.98] text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/[0.08] flex items-center justify-center text-primary">
                <span className="material-symbols-rounded">photo_library</span>
              </div>
              <div>
                <div className="font-bold text-sm text-on-surface">Categorieën beheren</div>
                <div className="text-xs text-muted-foreground">Voorbeeld foto's toevoegen per categorie</div>
              </div>
            </div>
            <span className="material-symbols-rounded text-muted-foreground">chevron_right</span>
          </button>

          <div className="w-full bg-card rounded-2xl p-4 border border-outline-variant/10 shadow-sm flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-surface-container flex items-center justify-center text-muted-foreground">
              <span className="material-symbols-rounded">info</span>
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">Over de app</div>
              <div className="text-xs text-muted-foreground">Technische Oplevering · {current?.regio}</div>
            </div>
          </div>
        </div>

        {/* ── OPSLAAN ── */}
        {hasChanges && (
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-surface-white/95 backdrop-blur-xl border-t border-outline-variant/10 pb-[max(16px,env(safe-area-inset-bottom))]">
            <div className="flex gap-2.5 max-w-lg mx-auto">
              <button
                onClick={() => {
                  setForm({});
                  applyTheme(instellingen || DEFAULT_THEME);
                }}
                className="flex-1 min-h-[48px] bg-surface-container rounded-xl font-semibold text-sm text-muted-foreground active:scale-[0.98] transition-transform"
              >
                Annuleren
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 min-h-[48px] bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-display font-bold text-sm shadow-lg shadow-primary/25 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
