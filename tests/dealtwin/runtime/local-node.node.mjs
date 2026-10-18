// Adapted from Undici's MIT-licensed opening-handshake and
// permessage-deflate-limit regressions at d39a83e7b0d631590c3b85b5cc0dbeab66c3a1d8.
// See undici-LICENSE and docs/dealtwin/LOCAL-NODE-RUNTIME-20261018.md.
// Uses the selected Node's REAL global WebSocket/fetch. External Undici Agent
// supplies a small size limit/transport, not the WebSocket parser under test.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {createDeflateRaw, constants} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {WebSocketServer} from 'ws';
const require=createRequire(import.meta.url);
const {Agent,WebSocket:externalWebSocket}=require('undici');
const pin=JSON.parse(readFileSync(new URL('../../../scripts/dealtwin/local-runtime.json',import.meta.url),'utf8'));
const options={timeout:5000};

function closed(client) {
  return new Promise(resolve=>client.addEventListener('close',resolve,{once:true}));
}

test('pinned local Node and built-in Undici identity',options,()=>{
  assert.equal(process.versions.node,pin.nodeVersion);
  assert.equal(process.versions.undici,pin.undiciVersion);
  assert.notEqual(globalThis.WebSocket,externalWebSocket);
});

test('native WebSocket rejects an unrequested subprotocol without process failure',options,async t=>{
  const sockets=new Set();
  const server=createServer();
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  server.on('upgrade',(request,socket)=>{
    const accept=createHash('sha1').update(request.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\nSec-WebSocket-Protocol: chat\r\n\r\n');
  });
  t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const client=new globalThis.WebSocket('ws://127.0.0.1:'+server.address().port);
  let opened=false;let errors=0;
  client.addEventListener('open',()=>{opened=true;client.close();});
  client.addEventListener('error',()=>errors++);
  await closed(client);
  assert.equal(opened,false);assert.ok(errors>0);assert.equal(client.readyState,globalThis.WebSocket.CLOSED);
});

test('native WebSocket stops malformed over-limit inflation without an unhandled zlib error',options,async t=>{
  const limit=1024;
  const server=new WebSocketServer({host:'127.0.0.1',port:0,perMessageDeflate:true});
  const agent=new Agent({webSocket:{maxPayloadSize:limit}});
  const compressors=new Set();
  t.after(async()=>{
    for(const compressor of compressors)compressor.destroy();
    for(const client of server.clients)client.terminate();
    await new Promise(resolve=>server.close(resolve));await agent.destroy();
  });
  await once(server,'listening');
  server.on('connection',socket=>{
    const compressor=createDeflateRaw();compressors.add(compressor);
    const chunks=[];compressor.on('data',chunk=>chunks.push(chunk));
    // At most 17 KiB of decoded synthetic data; no large compression payload.
    compressor.write(Buffer.alloc(limit+16*1024));
    compressor.flush(constants.Z_SYNC_FLUSH,()=>{
      const payload=Buffer.concat([...chunks,Buffer.from([0,0,0,0,0,255,255])]);
      assert.ok(payload.length<1024);
      const header=Buffer.alloc(10);header[0]=0xC2;header[1]=0x7f;header.writeUInt32BE(payload.length,6);
      socket._socket.write(Buffer.concat([header,payload]));compressor.destroy();
    });
  });
  const client=new globalThis.WebSocket('ws://127.0.0.1:'+server.address().port,{dispatcher:agent});
  let received=false;client.addEventListener('message',()=>{received=true;});client.addEventListener('error',()=>{});
  await closed(client);
  assert.equal(received,false);assert.equal(client.readyState,globalThis.WebSocket.CLOSED);
});

test('ordinary native fetch, web streams, headers and WebSocket echo remain usable',options,async t=>{
  const server=createServer(async(request,response)=>{
    let body='';for await(const chunk of request)body+=chunk;
    response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({method:request.method,body}));
  });
  const websocket=new WebSocketServer({server});
  websocket.on('connection',socket=>socket.on('message',message=>socket.send(message.toString())));
  t.after(async()=>{
    for(const client of websocket.clients)client.terminate();
    await new Promise(resolve=>websocket.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const response=await globalThis.fetch(new Request(url,{method:'POST',headers:new Headers({'content-type':'text/plain'}),body:'synthetic'}));
  assert.deepEqual(await response.json(),{method:'POST',body:'synthetic'});
  const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('stream'));controller.close();}});
  assert.equal(await new Response(stream).text(),'stream');
  const client=new globalThis.WebSocket(url.replace('http:','ws:'));
  client.addEventListener('open',()=>client.send('echo'));
  const [message]=await once(client,'message');assert.equal(message.data,'echo');
  const closing=closed(client);client.close();await closing;
});
