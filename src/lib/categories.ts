export interface Category {
  id: number;
  name: string;
  instruction: string;
  tip?: string;
  section: string;
}

export interface Section {
  id: string;
  label: string;
  description: string;
  color: string;
}

export const SECTIONS: Section[] = [
  {
    id: "algemeen",
    label: "Algemene gegevens",
    description: "Basisgegevens van de MSR",
    color: "hsl(150 100% 20%)",
  },
  {
    id: "ms-deel",
    label: "MS-Deel",
    description: "Gesloten installaties (ABB, SIEMENS, XIRIA, SVS)",
    color: "hsl(220 80% 40%)",
  },
  {
    id: "kabels-ms",
    label: "Kabels en eindsluitingen MS",
    description: "Middenspanningskabels en eindsluitingen. Zorg dat kabelmarkeringen goed zichtbaar zijn.",
    color: "hsl(280 60% 40%)",
  },
  {
    id: "trafo",
    label: "Trafo",
    description: "Leg de transformator en alle aansluitingen duidelijk vast. Zorg dat alle tekst leesbaar is.",
    color: "hsl(30 90% 40%)",
  },
  {
    id: "ls-deel",
    label: "LS-Deel",
    description: "Laagspanningsinstallatie",
    color: "hsl(190 70% 35%)",
  },
  {
    id: "meting",
    label: "Meting",
    description: "Meetinstrumenten en meetwaarden. Zorg dat alle waardes en typeplaatjes leesbaar zijn.",
    color: "hsl(340 70% 40%)",
  },
  {
    id: "ovl-deel",
    label: "OVL-Deel",
    description: "OVL-installatie. Zorg dat zekeringwaarden en meters duidelijk leesbaar zijn.",
    color: "hsl(60 80% 30%)",
  },
  {
    id: "gebouw",
    label: "Gebouwgebonden installatie",
    description: "Verlichting, wandcontactdozen, aarding en ringleidingen. Zorg dat aansluitingen en kabels zichtbaar zijn.",
    color: "hsl(150 60% 30%)",
  },
];

export const CATEGORIES: Category[] = [
  // ── ALGEMENE GEGEVENS ──────────────────────────────────
  { id: 1, section: "algemeen", name: "Typeplaatje / fabricagenummer", instruction: "Fotografeer het typeplaatje of fabricagenummer van de stationsschil.", tip: "Zorg dat het nummer volledig leesbaar is. Maak indien nodig een close-up." },
  { id: 2, section: "algemeen", name: "Ruimte overzicht (Buiten)", instruction: "Maak een overzichtsfoto van de buitenkant van het station.", tip: "Fotografeer het volledige gebouw inclusief omgeving. Zorg voor goede belichting." },
  { id: 3, section: "algemeen", name: "Deuren met stationsbenaming", instruction: "Fotografeer alle deuren inclusief de stationsbenaming/naamplaatjes.", tip: "Zorg dat de tekst op de deuren leesbaar is." },
  { id: 4, section: "algemeen", name: "Lips-sloten", instruction: "Fotografeer alle Lips-sloten op de deuren.", tip: "Maak een duidelijke close-up van elk slot zodat het type herkenbaar is." },
  { id: 5, section: "algemeen", name: "Overzicht binnenzijde (LS & MS)", instruction: "Maak een overzichtsfoto van de binnenzijde van de ruimte, zowel het LS- als MS-deel.", tip: "Sta in de deuropening en fotografeer de volledige ruimte." },
  { id: 6, section: "algemeen", name: "Foto Kelder", instruction: "Fotografeer de kelder van het station.", tip: "Zorg voor voldoende belichting. Gebruik indien nodig de flits." },
  { id: 7, section: "algemeen", name: "Overzichtsfoto kabelinvoer", instruction: "Maak een overzichtsfoto van de kabelinvoer.", tip: "Alle kabelinvoeren moeten zichtbaar zijn op de foto." },

  // ── MS-DEEL ────────────────────────────────────────────
  { id: 8, section: "ms-deel", name: "Overzicht MS installatie", instruction: "Fotografeer een volledig overzicht van de MS-installatie.", tip: "Zorg dat alle velden in beeld zijn." },
  { id: 9, section: "ms-deel", name: "Foto per veld", instruction: "Maak van elk MS-veld een aparte foto.", tip: "Fotografeer elk veld individueel van voren. Zorg voor duidelijkheid van het veldnummer." },
  { id: 10, section: "ms-deel", name: "Typeplaatje schakelaar", instruction: "Fotografeer het typeplaatje van de schakelaar.", tip: "Close-up zodat merk, type en serienummer leesbaar zijn." },
  { id: 11, section: "ms-deel", name: "Foto testrapport", instruction: "Fotografeer het testrapport van de MS-installatie.", tip: "Alle pagina's moeten leesbaar zijn. Maak meerdere foto's indien nodig." },
  { id: 12, section: "ms-deel", name: "Typeplaatjes MS schakelaar", instruction: "Fotografeer alle typeplaatjes op de MS-schakelaar.", tip: "Maak van elk typeplaatje een aparte close-up foto." },
  { id: 13, section: "ms-deel", name: "Aarding schakelaar", instruction: "Fotografeer de aardingspunten van de schakelaar.", tip: "Zorg dat de aardingsverbindingen duidelijk zichtbaar zijn." },
  { id: 14, section: "ms-deel", name: "Stroomtrafo's vermogensveld", instruction: "Fotografeer de stroomtransformatoren in het vermogensveld.", tip: "Alleen fotograferen als vermogensveld aanwezig is." },
  { id: 15, section: "ms-deel", name: "DA-kast", instruction: "Fotografeer de DA-kast (Directe Aansluitkast).", tip: "Alleen fotograferen als DA-kast aanwezig is. Maak zowel een overzichts- als detailfoto." },

  // ── KABELS EN EINDSLUITINGEN MS ────────────────────────
  { id: 16, section: "kabels-ms", name: "Eindsluitingen MS", instruction: "Fotografeer de eindsluitingen van de MS-kabels inclusief merk en type.", tip: "Zorg dat het merk en type van de eindsluiting leesbaar is op de foto." },
  { id: 17, section: "kabels-ms", name: "MS-moffen", instruction: "Fotografeer alle MS-moffen.", tip: "Fotografeer elke mof individueel zodat het type herkenbaar is." },

  // ── TRAFO ──────────────────────────────────────────────
  { id: 18, section: "trafo", name: "Trafo typeplaatje", instruction: "Fotografeer het typeplaatje van de transformator.", tip: "Zorg dat kVA-waarde, spanning en serienummer leesbaar zijn." },
  { id: 19, section: "trafo", name: "Trafo overzicht", instruction: "Maak een overzichtsfoto van de complete transformator.", tip: "Fotografeer de trafo van voren zodat het complete apparaat zichtbaar is." },
  { id: 20, section: "trafo", name: "Trafo bovenzijde / eindsluitingen", instruction: "Fotografeer de bovenzijde van de trafo inclusief de eindsluitingen.", tip: "Zorg dat alle aansluitingen aan de bovenkant zichtbaar zijn." },
  { id: 21, section: "trafo", name: "Tapstand trafo", instruction: "Fotografeer de tapstandinstelling van de transformator.", tip: "De huidige tapstand moet duidelijk leesbaar zijn op de foto." },
  { id: 22, section: "trafo", name: "Nul-aarde koppeling", instruction: "Fotografeer de nul-aarde koppeling van de transformator.", tip: "Zorg dat de koppelverbinding duidelijk zichtbaar zijn." },

  // ── LS-DEEL ────────────────────────────────────────────
  { id: 23, section: "ls-deel", name: "Richtingsbord kabelnummers", instruction: "Fotografeer het witte richtingsbord met kabelnummers en/of richtingsnamen.", tip: "Alle tekst op het bord moet leesbaar zijn." },
  { id: 24, section: "ls-deel", name: "LS-installatie overzichtsfoto's", instruction: "Maak overzichtsfoto's van de LS-installatie (vooraanzicht).", tip: "Fotografeer de volledige LS-rek van voren." },
  { id: 25, section: "ls-deel", name: "Typeplaatje LS rek", instruction: "Fotografeer het typeplaatje van de LS-rek.", tip: "Merk, type en serienummer moeten leesbaar zijn." },
  { id: 26, section: "ls-deel", name: "Typeplaatje voedende strook", instruction: "Fotografeer het typeplaatje van de voedende strook.", tip: "Volledig en leesbaar in beeld." },
  { id: 27, section: "ls-deel", name: "Zekering waarde voedende strook", instruction: "Fotografeer de zekeringswaarde (kVA) van de voedende strook.", tip: "De waarde op de zekering moet duidelijk leesbaar zijn." },
  { id: 28, section: "ls-deel", name: "Kabelnummers met mes-patroon", instruction: "Fotografeer de kabelnummers inclusief het mespatroon en de bijbehorende waarden.", tip: "Maak per strook een foto zodat alle nummers en patronen leesbaar zijn." },
  { id: 29, section: "ls-deel", name: "LS eindsluitingen en hulpaders", instruction: "Fotografeer de LS-eindsluitingen en hulpaders.", tip: "Zorg dat de kleurcodering van de aders zichtbaar is." },

  // ── METING ─────────────────────────────────────────────
  { id: 30, section: "meting", name: "TMA", instruction: "Fotografeer de TMA (Tijdelijk Meet Aansluitpunt).", tip: "Fotografeer het complete TMA inclusief aansluitingen." },
  { id: 31, section: "meting", name: "Stroomtransformatoren", instruction: "Fotografeer de stroomtransformatoren in de LS-installatie.", tip: "Maak een duidelijke foto van elke stroomtransformator." },

  // ── OVL-DEEL ───────────────────────────────────────────
  { id: 32, section: "ovl-deel", name: "Overzicht OVL gedeelte", instruction: "Fotografeer een overzicht van het OVL (OVerige Lading) gedeelte.", tip: "Alle componenten in het OVL-gedeelte moeten zichtbaar zijn." },
  { id: 33, section: "ovl-deel", name: "Zekering waarde OV beveiliging", instruction: "Fotografeer de zekeringswaarde van de OV-beveiliging.", tip: "De waarde op de zekering moet duidelijk leesbaar zijn." },
  { id: 34, section: "ovl-deel", name: "Flex-OV Modem", instruction: "Fotografeer de Flex-OV modem.", tip: "Fotografeer de modem inclusief de aansluitingen en eventuele LED-indicatoren." },
  { id: 35, section: "ovl-deel", name: "Flex-OV Router", instruction: "Fotografeer de Flex-OV router.", tip: "Fotografeer de router inclusief alle aansluitingen." },
  { id: 36, section: "ovl-deel", name: "E-meter", instruction: "Fotografeer de energiemeter (E-meter).", tip: "Zorg dat het display en het serienummer leesbaar zijn." },

  // ── GEBOUWGEBONDEN INSTALLATIE ─────────────────────────
  { id: 37, section: "gebouw", name: "Verlichting WCD", instruction: "Fotografeer de verlichting en wandcontactdozen (WCD) in het station.", tip: "Maak een overzichtsfoto van alle verlichtingspunten en WCD's." },
  { id: 38, section: "gebouw", name: "Stationsaarding", instruction: "Fotografeer de stationsaarding.", tip: "Zorg dat het aardpunt en de aardverbinding duidelijk zichtbaar zijn." },
  { id: 39, section: "gebouw", name: "Ringleiding aarding", instruction: "Fotografeer de ringleiding van de aarding.", tip: "Fotografeer het volledige traject van de ringleiding." },
  { id: 40, section: "gebouw", name: "Aarding metalen delen", instruction: "Fotografeer de aarding van de metalen delen.", tip: "Alle aardingsverbindingen op metalen constructiedelen moeten zichtbaar zijn." },
  { id: 41, section: "gebouw", name: "NSA-Luik", instruction: "Fotografeer het NSA-luik (Nood Stop Aansluiting).", tip: "Fotografeer het luik gesloten én geopend." },
];

// Backwards compatible exports
export const FOTO_CATEGORIEEN = CATEGORIES.map((c) => c.name);
export type FotoCategorie = (typeof FOTO_CATEGORIEEN)[number];

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Group categories by section */
export function getCategoriesBySection(): { section: Section; categories: Category[] }[] {
  return SECTIONS.map((section) => ({
    section,
    categories: CATEGORIES.filter((c) => c.section === section.id),
  }));
}
