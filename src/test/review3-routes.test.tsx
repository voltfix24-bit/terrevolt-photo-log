import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
const m=vi.hoisted(()=>({query:vi.fn(),refetch:vi.fn()}));
vi.mock('@/hooks/use-url-index',()=>({useUrlIndex:m.query}));
vi.mock('@/pages/StationDetail',()=>({default:()=> <div>Cached station available</div>}));
vi.mock('@/pages/CaseDetail',()=>({default:()=> <div>Target case</div>}));
vi.mock('@/pages/Opleveren',()=>({default:()=>null}));vi.mock('@/pages/BeoordeelDossier',()=>({default:()=>null}));
import {StationsRoute,CasesSleutelRoute,KorteLink} from '@/pages/UrlRoutes';
afterEach(cleanup);beforeEach(()=>{m.refetch.mockReset();m.query.mockReset().mockReturnValue({data:undefined,isError:true,isFetching:false,refetch:m.refetch});});
describe('finite targeted-route failure and preserved cache',()=>{
 for(const key of ['80000000-0000-4000-8000-000000000001','local-old-name']) it(`cold ${key} failure offers retry and back, no endless loader`,()=>{
  render(<MemoryRouter initialEntries={['/cases/'+key]}><Routes><Route path="/cases/:key" element={<CasesSleutelRoute/>}/><Route path="/" element={<div>Stations home</div>}/></Routes></MemoryRouter>);
  expect(screen.getByRole('alert')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Opnieuw proberen'}));expect(m.refetch).toHaveBeenCalledTimes(1);fireEvent.click(screen.getByRole('button',{name:'Terug naar stations'}));expect(screen.getByText('Stations home')).toBeInTheDocument();
 });
 it('short-link failures also terminate',()=>{
  render(<MemoryRouter initialEntries={['/c/LOCAL']}><Routes><Route path="/c/:nr" element={<KorteLink/>}/></Routes></MemoryRouter>);expect(screen.getByRole('alert')).toBeInTheDocument();
 });
 it('usable cached station survives failed revalidation offline',()=>{
  const s={id:'80000000-0000-4000-8000-000000000001',uitvoerder:'terrevolt',naam_msr:'Station',behuizingsnummer:'12'};
  m.query.mockReturnValue({data:{stations:[s],opdrachtgevers:[]},isError:true,isFetching:false,refetch:m.refetch});
  render(<MemoryRouter initialEntries={['/stations/12-station']}><Routes><Route path="/stations/:key/*" element={<StationsRoute/>}/></Routes></MemoryRouter>);expect(screen.getByText('Cached station available')).toBeInTheDocument();expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
});
