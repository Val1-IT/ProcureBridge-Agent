import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {nodeToWebRequest,sendWebResponse,tryServeStatic} from 'vinext/server/prod-server';
// Keep the native Windows asset lookup out of vinext's POSIX-keyed metadata cache.
// Reuse its public, path-contained filesystem serving and compiled production handler.
const host='127.0.0.1';const port=4177;const authority=host+':'+port;const origin='http://'+authority;
const entry=await import(pathToFileURL(resolve('dist/server/index.js')).href);
if(typeof entry.default!=='function')throw new Error('NODE_PRODUCTION_HANDLER_REQUIRED');
const clientDir=resolve('dist/client');
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==authority){res.writeHead(421).end();return;}
  const url=new URL(req.url??'/',origin);
  if(url.origin!==origin){res.writeHead(400).end();return;}
  if(url.pathname.startsWith('/assets/')){
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   if(!await tryServeStatic(req,res,clientDir,url.pathname,false))res.writeHead(404).end();
   return;
  }
  await sendWebResponse(await entry.default(nodeToWebRequest(req)),req,res,false);
 }catch{if(!res.headersSent)res.writeHead(500).end('Local request failed');else res.destroy();}
});
server.listen(port,host,()=>console.log('Local synthetic Judge production target ready on loopback4177.'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
