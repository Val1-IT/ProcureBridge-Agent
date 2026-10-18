import {createRequire} from 'node:module';
import type {Writable} from 'node:stream';
import {describe,expect,it} from 'vitest';

const require=createRequire(import.meta.url);
const {Receiver,WebSocketServer}=require('ws') as {
  Receiver:new(options:Record<string,unknown>)=>Writable;
  WebSocketServer:new(options:Record<string,unknown>)=>{options:{maxFragments?:number;maxBufferedChunks?:number};close(callback:()=>void):void};
};
const undici=require('undici') as {
  Headers:new(init:Record<string,string>)=>unknown;
  getSetCookies(headers:unknown):Array<{name:string;value:string;sameSite?:string}>;
};

describe('installed tooling dependency security boundaries',()=>{
  it('bounds WebSocket fragment/chunk counts by default without opening a listener',()=>{
    const server=new WebSocketServer({noServer:true});
    try{
      expect(server.options.maxFragments).toBeGreaterThan(0);
      expect(server.options.maxBufferedChunks).toBeGreaterThan(0);
    }finally{server.close(()=>{});}
  });

  it('rejects a third tiny fragment at a two-fragment limit while accepting a valid two-part message',async()=>{
    // Nine synthetic bytes exercise the count limit; no network or resource exhaustion.
    const receiver=new Receiver({isServer:false,maxFragments:2,maxPayload:1024});
    receiver.on('error',()=>{});
    const error=await new Promise<Error|null|undefined>(resolve=>receiver.write(
      Buffer.from([0x01,1,0x61,0x00,1,0x62,0x80,1,0x63]),resolve));
    expect(error).toMatchObject({code:'WS_ERR_TOO_MANY_BUFFERED_PARTS'});
    receiver.destroy();
    const valid=new Receiver({isServer:false,maxFragments:2,maxPayload:1024});
    const messages:Buffer[]=[];
    valid.on('message',(message:Buffer)=>messages.push(message));
    await new Promise<void>((resolve,reject)=>valid.write(Buffer.from([0x01,1,0x61,0x80,1,0x62]),error=>error?reject(error):resolve()));
    expect(messages.map(message=>message.toString())).toEqual(['ab']);
    valid.destroy();
  });

  it.each(['none-extra','not-strict','relaxed'])('does not interpret a SameSite substring as a valid token: %s',attribute=>{
    const headers=new undici.Headers({'set-cookie':`synthetic=value; SameSite=${attribute}`});
    expect(undici.getSetCookies(headers)[0]).toEqual({name:'synthetic',value:'value'});
  });

  it.each(['None','Strict','Lax'])('preserves a valid SameSite token: %s',sameSite=>{
    const headers=new undici.Headers({'set-cookie':`synthetic=value; SameSite=${sameSite}`});
    expect(undici.getSetCookies(headers)[0]).toMatchObject({name:'synthetic',value:'value',sameSite});
  });
});
