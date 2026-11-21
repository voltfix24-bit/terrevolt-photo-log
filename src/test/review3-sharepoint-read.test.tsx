import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const m=vi.hoisted(()=>({invoke:vi.fn(),read:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:m.invoke},from:()=>{const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>m.read()};return q;}}}));
import {SharePointDocumenten} from '@/components/SharePointDocumenten';
import {SharePointStatus} from '@/components/SharePointStatus';
const show=(node:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider>);
afterEach(cleanup);beforeEach(()=>{localStorage.clear();m.invoke.mockReset();m.read.mockReset().mockResolvedValue({data:null,error:{message:'Local read failure'}})});
describe('SharePoint read failures stay visible and do not imply absence',()=>{
 it('document API failure is an error, not an empty list; retry remains reachable',async()=>{
  m.invoke.mockResolvedValue({data:null,error:new Error('Local failure')});show(<SharePointDocumenten stationId="s"/>);await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Opnieuw proberen'}));await waitFor(()=>expect(m.invoke).toHaveBeenCalledTimes(2));
 });
 it('status/run/queue failures show an alert and never start sync implicitly',async()=>{
  show(<SharePointStatus station={{id:'s',uitvoerder:'terrevolt',status:'opgeleverd',casenummer:'LOCAL',casenaam:'Test'}}/>);await screen.findByRole('alert');expect(m.invoke).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'Opnieuw proberen'})).toBeEnabled();
 });
});
