// Delen-sheet van het rapport (WhatsApp, e-mail, ZIP, systeemdeelmenu)
export function ShareSheet({ stationNaam: shareStation, onClose, onZip }: { stationNaam: string; onClose: () => void; onZip: () => Promise<void> }) {
  return (
        <div className="fixed inset-x-0 z-[80] flex items-end" style={{ top: "var(--vvt, 0px)", height: "var(--vvh, 100dvh)" }}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => onClose()} />
          <div role="dialog" aria-modal="true" aria-labelledby="deel-titel" className="relative w-full bg-card rounded-t-3xl px-4 pt-4 sm:p-6 pb-[max(20px,env(safe-area-inset-bottom))] animate-slide-up shadow-2xl overflow-y-auto overscroll-contain" style={{ maxHeight: "calc(var(--vvh, 100dvh) - 8px)" }}>
            <div className="w-10 h-1 rounded-full bg-outline-variant/40 mx-auto mb-4" />
            <h3 id="deel-titel" className="font-display font-extrabold text-lg text-on-surface mb-1">Rapport delen</h3>
            <p className="text-sm text-muted-foreground mb-4" style={{ overflowWrap: "anywhere" }}>{shareStation} · TO Fotorapport</p>
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 mb-2">
              <button
                onClick={() => {
                  const msg = encodeURIComponent(`TO Fotorapport: ${shareStation}\n\nHet rapport is gegenereerd via TerreVolt TO Foto's app.\n\nOpgeslagen als PDF via de browser.`);
                  window.open(`https://wa.me/?text=${msg}`, '_blank');
                  onClose();
                }}
                className="flex min-h-12 items-center gap-3 px-3 py-2.5 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/20 hover:bg-[#25D366]/15 transition-all active:scale-[0.97]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#25D366] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-on-surface">WhatsApp</div>
                  <div className="text-sm text-muted-foreground">Stuur bericht</div>
                </div>
              </button>
              <button
                onClick={() => {
                  const subject = encodeURIComponent(`TO Fotorapport: ${shareStation}`);
                  const body = encodeURIComponent(`Beste,\n\nHierbij het TO Fotorapport voor ${shareStation}.\n\nHet rapport is aangemaakt via de TerreVolt TO Foto's app en opgeslagen als PDF.\n\nMet vriendelijke groet,\nTerreVolt B.V.`);
                  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                  onClose();
                }}
                className="flex min-h-12 items-center gap-3 px-3 py-2.5 rounded-2xl bg-primary/5 border border-primary/15 hover:bg-primary/[0.08] transition-all active:scale-[0.97]"
              >
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-rounded text-primary-foreground text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>mail</span>
                </div>
                <div className="text-left">
                  <div className="font-bold text-sm text-on-surface">Email</div>
                  <div className="text-sm text-muted-foreground">Stuur email</div>
                </div>
              </button>
            </div>
            <button
              onClick={async () => {
                await onZip();
                onClose();
              }}
              className="w-full flex min-h-12 items-center gap-3 px-3 py-2.5 rounded-2xl bg-primary/5 border border-primary/15 hover:bg-primary/[0.08] transition-all active:scale-[0.97] mb-2"
            >
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-rounded text-primary-foreground text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>folder_zip</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-sm text-on-surface">Foto's als ZIP</div>
                <div className="text-sm text-muted-foreground">Alle foto's van dit station</div>
              </div>
            </button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <button
                onClick={async () => {
                  try {
                    await navigator.share({ title: `TO Fotorapport: ${shareStation}`, text: `Technische Oplevering Fotorapport voor ${shareStation} - TerreVolt B.V.` });
                  } catch { /* cancelled */ }
                  onClose();
                }}
                className="w-full flex min-h-12 items-center justify-center gap-2.5 px-3 py-2.5 rounded-2xl bg-surface-container border border-outline-variant/20 hover:bg-surface-high transition-all active:scale-[0.97] mb-2"
              >
                <span className="material-symbols-rounded text-muted-foreground text-xl">ios_share</span>
                <span className="font-bold text-sm text-on-surface">Meer opties...</span>
              </button>
            )}
            <button autoFocus onClick={() => onClose()} className="w-full min-h-12 py-3 rounded-2xl bg-surface-low text-sm font-semibold text-muted-foreground active:scale-[0.98] transition-all">
              Sluiten
            </button>
          </div>
        </div>
  );
}
