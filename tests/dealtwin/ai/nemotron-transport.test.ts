import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {expect,it} from 'vitest';
import {NemotronClient} from '../../../lib/dealtwin/ai/nemotron-client';

// Real native fetch/AbortSignal behavior against one test-owned loopback server.
// No provider request or credential: the injected fetcher rewrites only transport.
it.each([401,429,503])('closes an unread streaming HTTP %i response without retrying',async status=>{
 let requests=0;
 let disconnected!:()=>void;
 const closed=new Promise<void>(resolve=>{disconnected=resolve;});
 const server=createServer((_request,response)=>{
  requests++;
  response.once('close',disconnected);
  response.writeHead(status,{'content-type':'application/json'});
  response.flushHeaders();
  response.write('{"error":"synthetic response intentionally left open');
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 try{
  const address=server.address();if(!address||typeof address==='string')throw Error('TEST_LISTENER_REQUIRED');
  const fetcher:typeof fetch=async(target,init)=>{
   expect(String(target)).toBe('https://api.tokenfactory.nebius.com/v1/chat/completions');
   return fetch(`http://127.0.0.1:${address.port}`,init);
  };
  const client=new NemotronClient({apiKey:'synthetic-test-only',model:'synthetic-nemotron',enabled:true,fetcher});
  await expect(client.complete({system:'JSON only',user:'synthetic commercial terms'})).rejects.toMatchObject({code:'AI_PROVIDER_UNAVAILABLE',httpStatus:503});
  // The operation has already returned. An unread body must not survive until
  // the old five-second deadline (which was previously cleared on this branch).
  expect(await Promise.race([closed.then(()=>true),delay(500,false)])).toBe(true);
  expect(requests).toBe(1);
 }finally{
  server.closeAllConnections();
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
},5000);
