import { forwardRef } from "react";
import { ChevronDown } from "lucide-react";
import { Hairline, Kaart, Pressable, T, M, ROW_MIN, ROW_PAD_X, INSET_HEAD } from "@/components/apple/Primitives";
import type { MergedCategory } from "@/hooks/use-categories";
import { CategoryRow, VoltooidVink } from "./CategoryRow";
import type { FotoRow } from "./types";

type Props = {
  section: { id: string; label: string };
  cats: MergedCategory[];
  isSectionOpen: boolean;
  onToggle: () => void;
  catDone: (c: MergedCategory) => boolean;
  isSkipped: (naam: string) => boolean;
  fotosByCategorie: (naam: string) => FotoRow[];
  skippedReasons: Record<string, string>;
  opmerkingVan: (naam: string) => string | undefined;
  onOpen: (cat: MergedCategory) => void;
};

/** Eén sectiekaart (accordeon) op de stationspagina: open categorieën eerst, dan klaar, dan N.v.t. */
export const SectieKaart = forwardRef<HTMLDivElement, Props>(function SectieKaart({ section, cats, isSectionOpen, onToggle, catDone, isSkipped, fotosByCategorie, skippedReasons, opmerkingVan, onOpen }, ref) {
  const doneCats = cats.filter(c => catDone(c) && !isSkipped(c.name));
  const openCats = cats.filter(c => !catDone(c) && !isSkipped(c.name));
  const skippedCats = cats.filter(c => fotosByCategorie(c.name).length === 0 && isSkipped(c.name));
  const isComplete = openCats.length === 0;
  const sectieFotos = cats.reduce((n, c) => n + fotosByCategorie(c.name).length, 0);
  const lijn = isComplete ? "rgba(31,92,58,0.16)" : T.hairline;
  const sortedCats = [...openCats, ...doneCats, ...skippedCats];
  return (
              <Kaart ref={ref} done={isComplete}>
                {/* Section header */}
                <Pressable
                  onClick={onToggle}
                  scale={0.99}
                  aria-expanded={isSectionOpen}
                  style={{ display: "flex", minHeight: ROW_MIN, alignItems: "center", justifyContent: "space-between", padding: `15px ${ROW_PAD_X}px`, width: "100%", textAlign: "left" }}
                >
                  <div style={{ minWidth: 0 }}>
                      <h2 className="font-display" style={{ fontSize: 17, fontWeight: 600, color: T.titleOnBg }}>
                        {section.label}
                      </h2>
                      {isComplete ? (
                        <p style={{ fontSize: 13, fontWeight: 600, marginTop: 3, color: T.green, display: "flex", alignItems: "center", gap: 5 }}>
                          <VoltooidVink />
                          <span>Voltooid · {sectieFotos} foto&apos;s</span>
                        </p>
                      ) : (
                        <p style={{ fontSize: 13, marginTop: 3, color: T.bodyOnBg }}>{doneCats.length} van {cats.length} gedaan</p>
                      )}
                  </div>
                  <ChevronDown size={22} color={T.titleOnBg} style={{ flexShrink: 0, transform: isSectionOpen ? "rotate(180deg)" : "rotate(0deg)", transition: `transform 0.3s ${M.spring}` }} />
                </Pressable>

                {/* Expanded content */}
                {isSectionOpen && (
                  <div>
                    <Hairline inset={INSET_HEAD} color={lijn} />
                    {sortedCats.map((cat, index) => <div key={cat.id}>
                      {index > 0 && <Hairline color={lijn} />}
                      <CategoryRow cat={cat} fotos={fotosByCategorie(cat.name)} isSkipped={isSkipped(cat.name)} skipReason={skippedReasons[cat.name]} opmerking={opmerkingVan(cat.name)} onOpen={() => onOpen(cat)} />
                    </div>)}
                  </div>
                )}
              </Kaart>
  );
});
