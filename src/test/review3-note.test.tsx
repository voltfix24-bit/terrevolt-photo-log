import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),beheer:vi.fn(),pin:vi.fn()}));
vi.mock('@/lib/to-rondes',()=>({db:{rpc:mocks.rpc}}));vi.mock('@/lib/require-pin',()=>({heeftBeheerSessie:mocks.beheer,zorgVoorBeheer:mocks.pin}));
import {DossierNotitie} from '@/components/cases/DossierNotitie';
beforeEach(()=>{localStorage.clear();mocks.rpc.mockReset();mocks.beheer.mockReset().mockResolvedValue(true);mocks.pin.mockReset().mockResolvedValue(true);});afterEach(cleanup);
describe('local note operation fencing',()=>{
 it('existing pre-token draft receives a stable identity and is cleared only after confirmed save',async()=>{
  localStorage.setItem('dossier-notitie:s',JSON.stringify({tekst:'Existing local draft',versie:0}));mocks.rpc.mockResolvedValue({data:{conflict:false,versie:1},error:null});
  render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}}/>);expect(screen.getByRole('textbox')).toHaveValue('Existing local draft');
  const token=JSON.parse(localStorage.getItem('dossier-notitie:s')??'{}').token;expect(token).toMatch(/^[0-9a-f-]{36}$/);fireEvent.blur(screen.getByRole('textbox'));
  await waitFor(()=>expect(localStorage.getItem('dossier-notitie:s')).toBeNull());expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it('old response after unmount cannot erase a remounted newer draft; failed second save retains B',async()=>{
  let finish:((x:unknown)=>void)|undefined;const first=new Promise(resolve=>{finish=resolve;});
  mocks.rpc.mockReturnValueOnce(first).mockResolvedValue({data:null,error:{code:'42501'}});
  const a=render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}}/>);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'A'}});fireEvent.blur(screen.getByRole('textbox'));await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(1));a.unmount();
  const b=render(<DossierNotitie id="s" tekst="Original" versie={0} refresh={()=>{}}/>);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'B'}});fireEvent.blur(screen.getByRole('textbox'));await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(2));
  finish?.({data:{conflict:false,versie:1},error:null});await waitFor(()=>expect(JSON.parse(localStorage.getItem('dossier-notitie:s')??'{}').tekst).toBe('B'));
  b.unmount();render(<DossierNotitie id="s" tekst="A" versie={1} refresh={()=>{}}/>);expect(screen.getByRole('textbox')).toHaveValue('B');expect(mocks.rpc).toHaveBeenCalledTimes(2);
 });
 for(const failure of ['rpc','session'] as const) it(`${failure} rejected promise stops after one blur attempt, next explicit trigger only`,async()=>{
  if(failure==='rpc')mocks.rpc.mockRejectedValue(new Error('offline'));else mocks.beheer.mockRejectedValue(new Error('session check failed'));
  render(<DossierNotitie id="s" tekst="" versie={0} refresh={()=>{}}/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'Keep'}});fireEvent.blur(screen.getByRole('textbox'));
  await screen.findByRole('alert');await new Promise(r=>setTimeout(r,30));expect(mocks.beheer).toHaveBeenCalledTimes(1);expect(mocks.rpc).toHaveBeenCalledTimes(failure==='rpc'?1:0);expect(JSON.parse(localStorage.getItem('dossier-notitie:s')??'{}').tekst).toBe('Keep');
  fireEvent.blur(screen.getByRole('textbox'));await waitFor(()=>expect(mocks.beheer).toHaveBeenCalledTimes(2));
 });
});
