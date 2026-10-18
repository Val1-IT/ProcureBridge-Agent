export class ApiClientError extends Error {
 constructor(readonly code:string,readonly status=0,readonly body:unknown=null){super(code);}
}
async function request(path:string,init:RequestInit,fetcher:typeof fetch):Promise<unknown>{
 if(!/^\/api\/dealtwin\/[a-zA-Z0-9_%:/-]+$/.test(path)||path.includes('..'))throw new ApiClientError('INVALID_CLIENT_PATH');
 let response:Response;
 try{response=await fetcher(path,{...init,credentials:'same-origin',cache:'no-store'});}catch{throw new ApiClientError('NETWORK_UNAVAILABLE');}
 let body:unknown;try{body=await response.json();}catch{throw new ApiClientError('INVALID_SERVER_RESPONSE',response.status);}
 if(!response.ok){
  const code=body&&typeof body==='object'&&'error' in body&&(body as {error?:{code?:unknown}}).error?.code;
  throw new ApiClientError(typeof code==='string'?code:'REQUEST_FAILED',response.status,body);
 }
 return body;
}
export async function readWorkspace(fetcher:typeof fetch=fetch):Promise<unknown>{
 const value=await request('/api/dealtwin/judge/state',{method:'GET'},fetcher);
 if(!value||typeof value!=='object')throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 const data=value as {schemaVersion?:unknown;synthetic?:unknown;tenantId?:unknown;revision?:unknown;deals?:unknown;cash?:{openingBalanceRupiah?:unknown}};
 if(data.schemaVersion!=='dealtwin.judge-state.v1'||data.synthetic!==true||data.tenantId!=='dealtwin-judge-v1'||!Number.isSafeInteger(data.revision)||!Array.isArray(data.deals)
  ||typeof data.cash?.openingBalanceRupiah!=='string'||!/^\-?(0|[1-9][0-9]*)$/.test(data.cash.openingBalanceRupiah))throw new ApiClientError('INVALID_SERVER_SNAPSHOT');
 return value;
}
export function readResource(path:string,fetcher:typeof fetch=fetch):Promise<unknown>{return request(path,{method:'GET'},fetcher);}
export function sendCommand(path:string,body:unknown,fetcher:typeof fetch=fetch,method:'POST'|'PATCH'='POST'):Promise<unknown>{
 return request(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)},fetcher);
}
