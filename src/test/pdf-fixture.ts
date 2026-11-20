// Vaste invoer voor de regressietest van generatePdfHtml (incl. injectiepogingen)
export const fixtureStation = { naam_msr: 'MSR <script>alert(1)</script> "Mariastraat"', behuizingsnummer: "BH-12'3", type_ruimte: "Compact Station", datum: "2026-11-20", ingevuld_door: "Jan & <b>Piet</b>" };
export const fixtureFotos = [
  { id: "f1", categorie: "Overzicht binnenzijde (LS & MS)", url: "https://x.test/a.jpg", uploaded_at: "2026-11-20T10:00:00Z" },
  { id: "f2", categorie: "Overzicht binnenzijde (LS & MS)", url: 'https://x.test/b.jpg" onerror="alert(1)', uploaded_at: "2026-11-20T10:01:00Z" },
  { id: "f3", categorie: "Stroomtransformatoren", url: "javascript:alert(1)" },
  { id: "f4", categorie: "Stroomtransformatoren", url: "https://x.test/c.jpg" },
];
export const fixtureBranding = { bedrijfsnaam: "Terrevolt <i>B.V.</i>", regio: "Zuid`oost", logo_url: "javascript:evil()", primary_color: "150 100% 20%; background:url(x)", primary_light_color: "140 65% 66%" };
export const fixtureOpm = [{ categorie: "Overzicht binnenzijde (LS & MS)", opmerking: "<img src=x onerror=alert(1)>\nregel 2" }];
export const fixtureSkips = [{ categorie: "Kabels <MS>", reden: "Niet \"bereikbaar\"" }];
