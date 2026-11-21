import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('@/components/cases/ExcelImportDialog',()=>{throw new Error('Failed to fetch dynamically imported module')});
vi.mock('@/components/cases/CaseToevoegenDialog',()=>({CaseToevoegenDialog:()=>null}));
vi.mock('@/lib/to-rondes',async(importOriginal)=>({...await importOriginal<Record<string,unknown>>(),useCases:()=>({data:[],isLoading:false})}));
import Cases from '@/pages/Cases';
afterEach(()=>{cleanup();vi.restoreAllMocks()});
describe('local import chunk failure',()=>{
 it('failed import download stays inside dialog; Cases and navigation remain usable',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  const q=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<QueryClientProvider client={q}><MemoryRouter><Cases/></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Importeren uit Excel'}));await screen.findByRole('alert');expect(screen.getByText('Cases & TO')).toBeInTheDocument();expect(screen.getAllByRole('button',{name:'Sluiten'})[0]).toBeEnabled();fireEvent.click(screen.getAllByRole('button',{name:'Sluiten'})[0]);await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());fireEvent.click(screen.getByRole('tab',{name:'TO-score'}));expect(screen.getByText('Geen cases')).toBeInTheDocument();
 });
});
