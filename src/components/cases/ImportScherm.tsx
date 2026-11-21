import { Component, lazy, Suspense, useMemo, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BlokLader } from "@/components/Laden";

function ImportLaadFout({ sluiten, opnieuw }: { sluiten: () => void; opnieuw: () => void }) {
  return <Dialog open onOpenChange={o => { if (!o) sluiten(); }}><DialogContent><DialogHeader><DialogTitle>Importeren niet beschikbaar</DialogTitle><DialogDescription>Controleer je verbinding en probeer opnieuw.</DialogDescription></DialogHeader><p role="alert">Het importscherm kon niet worden geladen. Controleer je verbinding en probeer opnieuw.</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={sluiten}>Sluiten</Button><Button onClick={opnieuw}>Opnieuw proberen</Button></div></DialogContent></Dialog>;
}
export class ImportFoutGrens extends Component<{ children: ReactNode; sluiten: () => void; opnieuw: () => void }, { fout: boolean }> {
  state = { fout: false };
  static getDerivedStateFromError() { return { fout: true }; }
  render() {
    if (!this.state.fout) return this.props.children;
    return <ImportLaadFout sluiten={this.props.sluiten} opnieuw={this.props.opnieuw} />;
  }
}
export function ImportScherm({ sluiten, opnieuw, bestaand, poging }: { sluiten: () => void; opnieuw: () => void; bestaand: string[]; poging: number }) {
  const Excel = useMemo(() => lazy(() => import("./ExcelImportDialog").then(m => ({ default: m.ExcelImportDialog })).catch(() => ({ default: () => <ImportLaadFout sluiten={sluiten} opnieuw={opnieuw} /> }))), [poging]);
  return <Suspense fallback={<BlokLader />}><Excel open onOpenChange={o => { if (!o) sluiten(); }} bestaand={bestaand} /></Suspense>;
}