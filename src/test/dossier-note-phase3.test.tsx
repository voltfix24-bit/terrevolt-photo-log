import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ rpc:vi.fn(),beheer:vi.fn(),pin:vi.fn() }));
vi.mock("@/lib/to-rondes",()=>({ db:{ rpc:mock.rpc } }));
vi.mock("@/lib/require-pin",()=>({ heeftBeheerSessie:mock.beheer,zorgVoorBeheer:mock.pin }));
import { DossierNotitie } from "@/components/cases/DossierNotitie";
beforeEach(()=>{ localStorage.clear(); mock.rpc.mockReset(); mock.beheer.mockReset().mockResolvedValue(true); mock.pin.mockReset().mockResolvedValue(true); });
afterEach(cleanup);
describe("dossier note preserves local text, CAS and route-exit saves",()=>{
  it("conflict preserves typed text and explicit merge uses the returned note version",async()=>{
    mock.rpc.mockResolvedValueOnce({ data:{ conflict:true,versie:2,tekst:"Colleague" },error:null }).mockResolvedValue({ data:{ conflict:false,versie:3,tekst:"Colleague\nMine" },error:null });
    render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}} />);
    fireEvent.change(screen.getByRole("textbox"),{ target:{ value:"Mine" } }); fireEvent.blur(screen.getByRole("textbox"));
    await screen.findByText("Teksten samenvoegen");
    expect(screen.getByRole("textbox")).toHaveValue("Mine"); expect(JSON.parse(localStorage.getItem("dossier-notitie:s") ?? "{}").tekst).toBe("Mine");
    fireEvent.click(screen.getByRole("button",{ name:"Teksten samenvoegen" }));
    fireEvent.click(screen.getByRole("button",{ name:"Ontgrendelen en opslaan" }));
    await waitFor(()=>expect(mock.rpc).toHaveBeenLastCalledWith("case_notitie_opslaan",{ _station_id:"s",_versie:2,_tekst:"Colleague\nMine" }));
    await waitFor(()=>expect(localStorage.getItem("dossier-notitie:s")).toBeNull());
  });
  it("expired grant retains text without a background PIN popup; explicit unlock retries",async()=>{
    mock.beheer.mockResolvedValue(false); mock.rpc.mockResolvedValue({ data:{ conflict:false,versie:1 },error:null });
    render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}} />);
    fireEvent.change(screen.getByRole("textbox"),{ target:{ value:"Retained" } }); fireEvent.blur(screen.getByRole("textbox"));
    await screen.findByRole("alert"); expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.pin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{ name:"Ontgrendelen en opslaan" }));
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("case_notitie_opslaan",{ _station_id:"s",_versie:0,_tekst:"Retained" }));
  });
  it("typing and immediately leaving starts one save, preserves draft on failure",async()=>{
    mock.rpc.mockResolvedValue({ data:null,error:{ code:"42501" } });
    const ui=render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}} />);
    fireEvent.change(screen.getByRole("textbox"),{ target:{ value:"Leaving text" } }); ui.unmount();
    await waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(1));
    expect(JSON.parse(localStorage.getItem("dossier-notitie:s") ?? "{}").tekst).toBe("Leaving text");
  });
});