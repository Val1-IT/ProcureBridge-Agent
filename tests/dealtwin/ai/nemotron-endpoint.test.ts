import {afterEach,describe,expect,it,vi} from 'vitest';
import {NemotronClient} from '../../../lib/dealtwin/ai/nemotron-client';
import {NemotronConstraintExtractor} from '../../../lib/dealtwin/ai/constraint-extractor';

const endpoint='https://api.tokenfactory.nebius.com/v1/chat/completions';
// Configuration candidate only: a mocked response cannot prove account access.
const model='nvidia/Nemotron-3_5-Lightning';
const content=JSON.stringify({schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[{kind:'customer_deposit_min_bps',value:2500,sourceText:'Deposit minimum 25%'}],missingFields:[]});
const reply={model,choices:[{message:{content},finish_reason:'stop'}]};
const input={system:'JSON only',user:'Deposit minimum 25%'};
const options={apiKey:'synthetic-test-only',model,enabled:true};
afterEach(()=>vi.useRealTimers());

describe('Token Factory exact endpoint contract',()=>{
 it.each([undefined,endpoint])('uses the official endpoint (override: %s) without redirects or retries',async configured=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify(reply)));
  const result=await new NemotronClient({...options,endpoint:configured,fetcher}).complete(input);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url,request]=fetcher.mock.calls[0];
  expect(url).toBe(endpoint);expect(request).toMatchObject({method:'POST',redirect:'error'});
  expect(JSON.parse(String(request?.body))).toMatchObject({model,max_tokens:2048,stream:false,response_format:{type:'json_object'}});
  expect(result).toEqual({content,model,provider:'nebius'});
 });
 it.each([
  'https://foreign.example/v1/chat/completions',
  'https://api.tokenfactory.nebius.com.foreign.example/v1/chat/completions',
  'https://api.tokenfactory.nebius.com@foreign.example/v1/chat/completions',
  'http://api.tokenfactory.nebius.com/v1/chat/completions',
  'https://api.tokenfactory.nebius.com/v1/models',
  endpoint+'?redirect=foreign.example',endpoint+'#fragment',
  'https://api.studio.nebius.com/v1/chat/completions',
 ])('rejects non-allowlisted URL %s before fetch',async url=>{
  const fetcher=vi.fn<typeof fetch>();
  await expect(new NemotronClient({...options,endpoint:url,fetcher}).complete(input)).rejects.toMatchObject({code:'INVALID_PROVIDER_CONFIG'});
  expect(fetcher).not.toHaveBeenCalled();
 });
 it.each([
  ['invalid envelope JSON','not JSON'],
  ['null envelope','null'],
  ['non-text content',JSON.stringify({...reply,choices:[{message:{content:[]},finish_reason:'stop'}]})],
  ['truncated generation',JSON.stringify({...reply,choices:[{message:{content},finish_reason:'length'}]})],
  ['missing finish reason',JSON.stringify({...reply,choices:[{message:{content}}]})],
  ['tool call',JSON.stringify({...reply,choices:[{message:{content,tool_calls:[{name:'commit'}]},finish_reason:'stop'}]})],
  ['multiple choices',JSON.stringify({...reply,choices:[...reply.choices,...reply.choices]})],
 ])('fails closed on %s without retry',async(_label,body)=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(body));
  await expect(new NemotronClient({...options,fetcher}).complete(input)).rejects.toMatchObject({code:'AI_OUTPUT_INVALID'});
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('validates content JSON through extraction and keeps valid candidates pending',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify(reply)));
  const extractor=new NemotronConstraintExtractor(new NemotronClient({...options,fetcher}));
  const extractionInput={text:input.user,confirmedConstraints:[],context:{currency:'IDR'}};
  const result=await extractor.extract(extractionInput);
  expect(result.candidates[0]).toMatchObject({provenance:'ai_extracted',resolution:'pending_confirmation'});
  fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({...reply,choices:[{message:{content:'not JSON'},finish_reason:'stop'}]})));
  await expect(extractor.extract(extractionInput)).rejects.toMatchObject({code:'AI_OUTPUT_INVALID'});
 });
 it.each(['headers','body'])('aborts the default 5-second deadline during %s and reports timeout, not model failure',async phase=>{
  vi.useFakeTimers();let signal:AbortSignal|undefined;let settled=false;
  const fetcher=vi.fn<typeof fetch>(async(_url,request)=>{
   signal=request?.signal??undefined;
   if(phase==='headers')return new Promise<Response>((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
   return new Response(new ReadableStream<Uint8Array>({start(controller){signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}}));
  });
  const operation=new NemotronClient({...options,fetcher}).complete(input);
  void operation.then(()=>{settled=true;},()=>{settled=true;});
  const rejection=expect(operation).rejects.toMatchObject({code:'AI_PROVIDER_TIMEOUT',httpStatus:503});
  await vi.advanceTimersByTimeAsync(4999);expect(settled).toBe(false);expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);await rejection;
  expect(signal?.aborted).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 });
 it('refuses a runtime deadline above 5 seconds before making any request',async()=>{
  const fetcher=vi.fn<typeof fetch>();
  await expect(new NemotronClient({...options,timeoutMs:5001,fetcher}).complete(input)).rejects.toMatchObject({code:'INVALID_PROVIDER_CONFIG'});
  expect(fetcher).not.toHaveBeenCalled();
 });
});
