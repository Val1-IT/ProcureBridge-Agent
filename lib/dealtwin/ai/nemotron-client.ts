import {ExtractionError,type ConstraintProvider,type ProviderReply} from './constraint-extractor';
const endpointUrl='https://api.tokenfactory.nebius.com/v1/chat/completions';
/** Sent as chat_template_kwargs.enable_thinking; exported so eval reports record it. */
export const NEMOTRON_THINKING=false;
export interface NemotronClientOptions {apiKey:string;model:string;enabled:boolean;fetcher?:typeof fetch;timeoutMs?:number;responseBytes?:number;endpoint?:string}
export class NemotronClient implements ConstraintProvider {
 constructor(private readonly options:NemotronClientOptions){}
 async complete(input:{system:string;user:string}):Promise<ProviderReply>{
  const options=this.options;if(!options.enabled)throw new ExtractionError('LIVE_PROVIDER_NOT_AUTHORIZED',503);
  const endpoint=options.endpoint??endpointUrl;
  const timeout=options.timeoutMs??5000;const limit=options.responseBytes??65536;
  if(endpoint!==endpointUrl||!options.apiKey||options.apiKey.length>4096||!options.apiKey.trim()||/[\r\n]/.test(options.apiKey)||!/^[a-zA-Z0-9/_.:-]{1,160}$/.test(options.model)||!/nemotron/i.test(options.model)
   ||!Number.isSafeInteger(timeout)||timeout<1||timeout>5000||!Number.isSafeInteger(limit)||limit<1||limit>65536)throw new ExtractionError('INVALID_PROVIDER_CONFIG',503);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{
   // Nemotron 3 Super reasons before answering by default (about 375 tokens a
   // call), and the JSON answer does not need it. With thinking off, a
   // diagnostic call on 2026-10-23 used no reasoning tokens and returned in
   // 1460 ms. Only nvidia/nemotron-3-super-120b-a12b has been checked: an id
   // that ignores the kwarg still reasons, and one that rejects it fails as
   // AI_PROVIDER_UNAVAILABLE.
   const response=await (options.fetcher??fetch)(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+options.apiKey,'content-type':'application/json'},signal:controller.signal,
    body:JSON.stringify({model:options.model,messages:[{role:'system',content:input.system},{role:'user',content:input.user}],temperature:0,response_format:{type:'json_object'},max_tokens:2048,stream:false,chat_template_kwargs:{enable_thinking:NEMOTRON_THINKING}})});
   if(!response.ok)throw new ExtractionError('AI_PROVIDER_UNAVAILABLE',503);
   const reader=response.body?.getReader();if(!reader)throw new ExtractionError('AI_OUTPUT_INVALID');
   const chunks:Uint8Array[]=[];let bytes=0;
   try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit){await reader.cancel();throw new ExtractionError('AI_RESPONSE_TOO_LARGE');}chunks.push(part.value);}}finally{reader.releaseLock();}
   const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
   let json:unknown;try{json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));}catch{throw new ExtractionError('AI_OUTPUT_INVALID');}
   const result=json as {model?:unknown;choices?:{finish_reason?:unknown;message?:{content?:unknown;tool_calls?:unknown}}[]};
   if(!result||typeof result.model!=='string'||result.model.length>160||!Array.isArray(result.choices)||result.choices.length!==1||result.choices[0]?.finish_reason!=='stop'
    ||typeof result.choices[0]?.message?.content!=='string'||result.choices[0].message.tool_calls)throw new ExtractionError('AI_OUTPUT_INVALID');
   return {content:result.choices[0].message.content,provider:'nebius',model:result.model};
  }catch(error){if(controller.signal.aborted)throw new ExtractionError('AI_PROVIDER_TIMEOUT',503);if(error instanceof ExtractionError)throw error;throw new ExtractionError('AI_PROVIDER_UNAVAILABLE',503);}
  finally{
   clearTimeout(timer);
   // A provider error can arrive before its streaming body finishes. Closing
   // the operation must also release that transport, not just stop its timer.
   controller.abort();
  }
 }
}
