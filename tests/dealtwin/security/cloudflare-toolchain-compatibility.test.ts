import {createRequire} from 'node:module';
import {describe,expect,it} from 'vitest';
import {Log,LogLevel,Miniflare} from 'miniflare';

const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const esbuild=wranglerRequire('esbuild') as {
  transform(source:string,options:Record<string,unknown>):Promise<{code:string;warnings:unknown[]}>;
};

describe('stable Cloudflare toolchain compatibility',()=>{
  it('transforms typed Worker source with Wrangler’s own native esbuild resolution',async()=>{
    const result=await esbuild.transform('export const amount: bigint = 25n;',{
      loader:'ts',target:'es2020',format:'esm',
    });
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('25n');
    expect(result.code).not.toContain(': bigint');
    expect(result.code).toContain('export');
  });

  it('serves a disposable Worker and round-trips synthetic D1/R2 bindings without remote services',async()=>{
    // An isolated toolchain fixture, not Sites hosting metadata or the Judge DB.
    // No outbound fetch, remote binding, persistent storage, account or credential.
    const runtime=new Miniflare({
      host:'127.0.0.1',port:0,modules:true,compatibilityDate:'2026-07-02',
      log:new Log(LogLevel.NONE),d1Databases:['DB'],r2Buckets:['BUCKET'],
      d1Persist:false,r2Persist:false,cachePersist:false,
      script:`export default { async fetch(request, env) {
        const path = new URL(request.url).pathname;
        if (path !== '/probe') return new Response('Not found', {status:404});
        if (request.method === 'POST') {
          await env.DB.prepare('CREATE TABLE IF NOT EXISTS probe (id TEXT PRIMARY KEY, value TEXT)').run();
          await env.DB.prepare('INSERT INTO probe (id, value) VALUES (?, ?)').bind('synthetic', 'db-value').run();
          await env.BUCKET.put('synthetic', 'object-value');
          return new Response(null, {status:201});
        }
        const row = await env.DB.prepare('SELECT value FROM probe WHERE id = ?').bind('synthetic').first();
        const object = await env.BUCKET.get('synthetic');
        return Response.json({database:row.value, object:await object.text()});
      }};`,
    });
    try{
      expect((await runtime.dispatchFetch('http://127.0.0.1/probe',{method:'POST'})).status).toBe(201);
      const response=await runtime.dispatchFetch('http://127.0.0.1/probe');
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({database:'db-value',object:'object-value'});
      expect((await runtime.dispatchFetch('http://127.0.0.1/missing')).status).toBe(404);
    }finally{
      await runtime.dispose();
    }
  },30000);
});
