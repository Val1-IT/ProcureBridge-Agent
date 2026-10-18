'use client';
import { createContext,useContext,useEffect,useRef,useState,useCallback,type ReactNode } from 'react';
import { usePathname,useSearchParams } from 'next/navigation';
import { selectDeal } from '../../lib/dealtwin/ui/selection';
import { ApiClientError,readWorkspace,readResource,sendCommand } from '../../lib/dealtwin/ui/api-client';
import { decodeWorkspace,type ServerWorkspace } from '../../lib/dealtwin/ui/workspace';
import { buildCommand,type UiAction } from '../../lib/dealtwin/ui/commands';
import type { CompileResultDto } from '../../lib/dealtwin/ui/contracts';
import type {UiCommand} from '../../lib/dealtwin/ui/commands';
interface WorkspaceContext {
 snapshot:ServerWorkspace|null;loading:boolean;busy:boolean;error:string|null;commandError:ApiClientError|null;lastResponse:unknown;
 detail:{compileRuns:{kind:string;violation_data:CompileResultDto|{resultPayload:{result:CompileResultDto}}}[]}|null;
 selectedDealId:string;refresh:()=>Promise<void>;run:(action:UiAction,dealId?:string)=>Promise<void>;canRetry:boolean;retryLast:()=>Promise<void>;
}
const Context=createContext<WorkspaceContext|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
 const pathname=usePathname();const [snapshot,setSnapshot]=useState<ServerWorkspace|null>(null);const [detail,setDetail]=useState<WorkspaceContext['detail']>(null);
 const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const [commandError,setCommandError]=useState<ApiClientError|null>(null);const [lastResponse,setLastResponse]=useState<unknown>(null);const epoch=useRef(0);
 const [lastCommand,setLastCommand]=useState<UiCommand|null>(null);
 const queryDeal=useSearchParams().get('dealId');
 const selectedDealId=snapshot?selectDeal(snapshot,pathname,queryDeal)??'':'';
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  const token=++epoch.current;setLoading(true);setError(null);
  const current=()=>token===epoch.current&&!signal?.aborted;
  try{
   const fresh=decodeWorkspace(await readWorkspace());if(!current())return;
   const id=selectDeal(fresh,pathname,queryDeal);
   let graph:WorkspaceContext['detail']=null;
   if(id&&(fresh.actor?.role==='admin'||fresh.actor?.role==='sales'))graph=await readResource('/api/dealtwin/deals/'+encodeURIComponent(id)) as WorkspaceContext['detail'];
   if(!current())return;setSnapshot(fresh);setDetail(graph);
  }catch(cause){if(!current())return;setSnapshot(null);setDetail(null);setError(cause instanceof ApiClientError?cause.code:'INVALID_SERVER_SNAPSHOT');}
  finally{if(current())setLoading(false);}
 },[pathname,queryDeal]);
 useEffect(()=>{const controller=new AbortController();void refresh(controller.signal);return()=>controller.abort();},[refresh]); // Server fetch cache only; URL selection is the sole local business navigation.
 async function run(action:UiAction,dealId=selectedDealId){
  if(!snapshot||busy||loading)return;setBusy(true);setCommandError(null);
  try{const requestedProofId=pathname.startsWith('/dealtwin/proofs/')?snapshot.proofs.find(row=>'/dealtwin/proofs/'+encodeURIComponent(row.id)===pathname)?.id:undefined;
   const command=buildCommand(snapshot,dealId,action,'ui-'+crypto.randomUUID(),requestedProofId);const response=await sendCommand(command.path,command.body,fetch,command.method);setLastResponse(response);setLastCommand(command);}
  catch(cause){setCommandError(cause instanceof ApiClientError?cause:new ApiClientError(cause instanceof Error?cause.message:'REQUEST_FAILED'));}
  finally{await refresh();setBusy(false);} // Never adopt response revision/state: retries may replay a historical receipt.
 }
 async function retryLast(){
  if(!lastCommand||!snapshot||busy||loading)return;setBusy(true);setCommandError(null);
  try{setLastResponse(await sendCommand(lastCommand.path,lastCommand.body,fetch,lastCommand.method));}
  catch(cause){setCommandError(cause instanceof ApiClientError?cause:new ApiClientError('REQUEST_FAILED'));}
  finally{await refresh();setBusy(false);}
 }
 return <Context.Provider value={{snapshot,loading,busy,error,commandError,lastResponse,detail,selectedDealId,refresh,run,canRetry:!!lastCommand,retryLast}}>{children}</Context.Provider>;
}
export function useWorkspace():WorkspaceContext{const value=useContext(Context);if(!value)throw new Error('DealTwin workspace provider required');return value;}
