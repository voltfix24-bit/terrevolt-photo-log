import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {importTellingen} from '@/lib/import-batch';
const m=vi.hoisted(()=>({create:vi.fn(),import:vi.fn(),numbers:vi.fn(),pin:vi.fn()}));
vi.mock('@/lib/case-service',()=>({maakCase:m.create,importCase:m.import,alleCaseNummers:m.numbers,valideerCase:()=>null,casePayload:(x:unknown)=>x}));
vi.mock('@/lib/require-pin',()=>({zorgVoorBeheer:m.pin}));
import {CaseToevoegenDialog} from '@/components/cases/CaseToevoegenDialog';
import {ExcelImportDialog} from '@/components/cases/ExcelImportDialog';
const provider=(children:React.ReactNode,q:QueryClient)=><QueryClientProvider client={q}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
beforeEach(()=>{m.create.mockReset();m.import.mockReset();m.numbers.mockReset().mockResolvedValue([]);m.pin.mockReset().mockResolvedValue(true);});afterEach(cleanup);
describe('one result per row and explicit local operation identity',()=>{
 it('created/replay/existing after refetch each count once and totals agree',()=>{
  const rows=[{regel:1,klasse:'bestaat'},{regel:2,klasse:'bestaat'},{regel:3,klasse:'bestaat'}];
  const result=importTellingen(rows,{1:{status:'aangemaakt'},2:{status:'replay'},3:{status:'bestaat'}});
  expect(result).toEqual({opgeslagen:2,bestaat:1,fout:0,resterend:0});expect(Object.values(result).reduce((a,b)=>a+b,0)).toBe(3);
 });
 it('uncertain create retains random UUID on retry; successful separate operation uses a new UUID',async()=>{
  m.create.mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({id:'local-id'});
  const q=new QueryClient({defaultOptions:{queries:{retry:false}}}),change=vi.fn();
  const ui=render(provider(<CaseToevoegenDialog open onOpenChange={change}/>,q));
  const fill=()=>{const inputs=screen.getAllByRole('textbox');fireEvent.change(inputs[0],{target:{value:'LOCAL'}});fireEvent.change(inputs[1],{target:{value:'Name'}})};fill();
  fireEvent.click(screen.getByRole('button',{name:'Case toevoegen'}));await screen.findByRole('alert');const first=m.create.mock.calls[0][1];expect(first).toMatch(/^[0-9a-f-]{36}$/);
  fireEvent.click(screen.getByRole('button',{name:'Case toevoegen'}));await waitFor(()=>expect(change).toHaveBeenCalledWith(false));expect(m.create.mock.calls[1][1]).toBe(first);
  ui.rerender(provider(<CaseToevoegenDialog open={false} onOpenChange={change}/>,q));ui.rerender(provider(<CaseToevoegenDialog open onOpenChange={change}/>,q));fill();fireEvent.click(screen.getByRole('button',{name:'Case toevoegen'}));
  await waitFor(()=>expect(m.create).toHaveBeenCalledTimes(3));expect(m.create.mock.calls[2][1]).not.toBe(first);
 });
 it('import retry keeps own UUID after response loss; closed/reopened batch gets a new random UUID',async()=>{
  m.import.mockResolvedValueOnce({status:'mislukt',pauze:true,fout:'lost response'}).mockResolvedValue({status:'replay',id:'local'});
  const q=new QueryClient({defaultOptions:{queries:{retry:false}}}),change=vi.fn();const ui=render(provider(<ExcelImportDialog open onOpenChange={change} bestaand={[]}/>,q));
  await waitFor(()=>expect(m.numbers).toHaveBeenCalled());fireEvent.change(screen.getByRole('textbox',{name:'Geplakte Excel-rijen'}),{target:{value:'Casenummer\tCasenaam\nLOCAL\tName'}});
  const importButton=()=>screen.getByRole('button',{name:'1 case importeren'});await waitFor(()=>expect(importButton()).toBeEnabled());fireEvent.click(importButton());await screen.findByRole('alert');const first=m.import.mock.calls[0][1];
  fireEvent.click(importButton());await waitFor(()=>expect(m.import).toHaveBeenCalledTimes(2));expect(m.import.mock.calls[1][1]).toBe(first);
  await waitFor(()=>expect(screen.getByText(/1 opgeslagen · 0 resterend · 0 bestaat al · 0 fout/)).toBeInTheDocument());
  ui.rerender(provider(<ExcelImportDialog open={false} onOpenChange={change} bestaand={[]}/>,q));ui.rerender(provider(<ExcelImportDialog open onOpenChange={change} bestaand={[]}/>,q));fireEvent.change(screen.getByRole('textbox',{name:'Geplakte Excel-rijen'}),{target:{value:'Casenummer\tCasenaam\nLOCAL\tName'}});fireEvent.click(importButton());
  await waitFor(()=>expect(m.import).toHaveBeenCalledTimes(3));expect(m.import.mock.calls[2][1]).not.toBe(first);
 });
});
