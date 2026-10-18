import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createFetchMock, Log, LogLevel, Miniflare} from 'miniflare';
import type sharpFactory from 'sharp';

const require = createRequire(import.meta.url);
const miniflareRequire = createRequire(require.resolve('miniflare'));
const sharp = miniflareRequire('sharp') as typeof sharpFactory;
const evidence = path.resolve('output/sharp-miniflare-20261018');
const inputs = path.join(evidence, 'synthetic-inputs');
mkdirSync(evidence, {recursive: true});
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="6"><rect width="8" height="6" fill="red"/></svg>');
const formats = ['png', 'jpeg', 'webp', 'gif', 'avif', 'tiff'] as const;
const records: object[] = [];
let png: Buffer;
let runtime: Miniflare;
const mock = createFetchMock();
mock.disableNetConnect();

beforeAll(async () => {
  // Windows cannot safely load both old/new libvips DLL families in one process.
  // Generate fixed inputs in a separate process; this worker loads only Miniflare's Sharp.
  const fixture = spawnSync(process.execPath, [path.resolve('tests/dealtwin/security/fixtures/sharp-image-fixtures.mjs'), inputs], {
    encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024,
    env:{...process.env,NODE_OPTIONS:'--max-old-space-size=512'},
  });
  expect(fixture.error).toBeUndefined();
  expect(fixture.status,fixture.stdout+fixture.stderr).toBe(0);
  expect(JSON.parse(fixture.stdout).versions.sharp).toBe('0.35.5');
  writeFileSync(path.join(evidence,'fixture-generation.json'),fixture.stdout);
  png = readFileSync(path.join(inputs,'red.png'));
  mock.get('https://synthetic.invalid').intercept({path: '/image.png'}).reply(200, png, {headers: {'content-type': 'image/png'}}).persist();
  mock.get('https://synthetic.invalid').intercept({path: '/image.svg'}).reply(200, svg, {headers: {'content-type': 'image/svg+xml'}}).persist();
  runtime = new Miniflare({
    host: '127.0.0.1', port: 0, modules: true, compatibilityDate: '2026-07-02',
    log: new Log(LogLevel.NONE), images: {binding: 'IMAGES'}, imagesPersist: false,
    cachePersist: false, fetchMock: mock,
    script: `export default { async fetch(request, env) {
      const url = new URL(request.url);
      try {
        if (url.pathname === '/info') return Response.json(await env.IMAGES.info(request.body));
        if (url.pathname === '/cf' || url.pathname === '/cfsvg') {
          return fetch('https://synthetic.invalid/image.' + (url.pathname === '/cfsvg' ? 'svg' : 'png'), {
            cf: {image: {width:3,height:4,rotate:90,fit:'contain',dpr:2,format:url.searchParams.get('format') || 'png'}}
          });
        }
        return (await env.IMAGES.input(request.body).transform({rotate:90,width:3,height:4})
          .output({format:url.searchParams.get('format') || 'image/png'})).response();
      } catch(error) { return new Response(String(error), {status:422}); }
    }};`,
  });
}, 30000);

afterAll(async () => {
  if (runtime) await runtime.dispose();
  await mock.close();
  writeFileSync(path.join(evidence, 'image-contracts.json'), JSON.stringify({versions: sharp.versions, records}, null, 2));
});

describe('scoped Miniflare Sharp compatibility', () => {
  it('loads the fixed package and native decoder versions in the actual Miniflare path', () => {
    expect(sharp.versions.sharp).toBe('0.35.5');
    expect(sharp.versions.vips).toBe('8.18.7');
    expect(sharp.versions.heif).toBe('1.23.5');
    expect(sharp.versions.rsvg).toBe('2.63.2');
    expect(require('miniflare/package.json').version).toBe('4.20260702.0');
  });

  it.each(formats)('decodes bounded synthetic %s input and preserves resize/color semantics', async format => {
    const input = readFileSync(path.join(inputs,`red.${format}`));
    expect(input.length).toBeLessThan(16384);
    const metadata = await sharp(input).metadata();
    expect(metadata).toMatchObject({width:8,height:6});
    const result = await sharp(input).resize(4,3).png().toBuffer();
    const decoded = await sharp(result).removeAlpha().raw().toBuffer({resolveWithObject:true});
    expect(decoded.info).toMatchObject({width:4,height:3,channels:3});
    for (let i=0;i<decoded.data.length;i+=3) {
      expect(decoded.data[i]).toBeGreaterThanOrEqual(240);
      expect(decoded.data[i+1]).toBeLessThanOrEqual(15);
      expect(decoded.data[i+2]).toBeLessThanOrEqual(15);
    }
    records.push({kind:'decode',format,inputBytes:input.length,width:4,height:3,redDominant:true});
  });

  it('preserves SVG decoding and bounded input/error limits without exploit payloads', async () => {
    expect(await sharp(svg).resize(4,3).png().metadata()).toMatchObject({format:'svg',width:8,height:6});
    const result = await sharp(svg).resize(4,3).png().toBuffer();
    expect(await sharp(result).metadata()).toMatchObject({format:'png',width:4,height:3});
    await expect(sharp(png, {limitInputPixels:47}).toBuffer()).rejects.toThrow(/pixel limit/i);
    await expect(sharp(Buffer.from('synthetic-not-an-image')).toBuffer()).rejects.toThrow();
    records.push({kind:'svg-and-errors',passed:true});
  });

  it('executes ten unchanged bounded upstream resize tests against the actual resolved package', () => {
    const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.resolve('tests/dealtwin/security/fixtures/sharp-upstream-resize.mjs')], {
      encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024,
      env:{...process.env,DEALTWIN_SHARP_MODULE:miniflareRequire.resolve('sharp'),NODE_OPTIONS:'--max-old-space-size=512'},
    });
    writeFileSync(path.join(evidence,'upstream-tests.log'), child.stdout + child.stderr);
    expect(child.error).toBeUndefined();
    expect(child.status,child.stdout+child.stderr).toBe(0);
    expect(child.stdout).toMatch(/tests 10/);
    expect(child.stdout).toMatch(/fail 0/);
  });

  it('uses Miniflare’s actual Images binding for metadata and streamed outputs', async () => {
    const info = await runtime.dispatchFetch('http://127.0.0.1/info', {method:'POST',body:png});
    expect(info.status).toBe(200);
    expect(await info.json()).toEqual({format:'image/png',fileSize:png.length,width:8,height:6});
    const svgInfo = await runtime.dispatchFetch('http://127.0.0.1/info', {method:'POST',body:svg});
    expect(await svgInfo.json()).toEqual({format:'image/svg+xml'});
    for (const format of ['png','jpeg','webp','avif']) {
      const response = await runtime.dispatchFetch(`http://127.0.0.1/binding?format=image/${format}`, {method:'POST',body:png});
      expect(response.status,await response.clone().text()).toBe(200);
      expect(response.headers.get('content-type')).toBe(`image/${format}`);
      const result = Buffer.from(await response.arrayBuffer());
      expect(result.length).toBeLessThan(16384);
      expect(await sharp(result).metadata()).toMatchObject({width:3,height:4});
      records.push({kind:'binding',format,width:3,height:4});
    }
    const unsupported = await runtime.dispatchFetch('http://127.0.0.1/binding?format=image/gif', {method:'POST',body:png});
    expect(unsupported.status).toBe(422);
    expect(await unsupported.text()).toMatch(/GIF output is not supported/);
  },30000);

  it('uses cf.image with mocked image bytes, DPR and existing error behavior', async () => {
    const response = await runtime.dispatchFetch('http://127.0.0.1/cf');
    expect(response.status,await response.clone().text()).toBe(200);
    expect(response.headers.get('cf-resized')).toBe('internal=ok/m');
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({format:'png',width:6,height:8});
    const json = await runtime.dispatchFetch('http://127.0.0.1/cf?format=json');
    expect(await json.json()).toMatchObject({width:6,height:8,original:{width:8,height:6,format:'image/png'}});
    const fallback = await runtime.dispatchFetch('http://127.0.0.1/cfsvg');
    const svgResult = {status:fallback.status,headers:Object.fromEntries(fallback.headers),body:await fallback.clone().text()};
    writeFileSync(path.join(evidence,'cf-svg-response.json'),JSON.stringify(svgResult,null,2));
    // The public cf.image route falls back to the original SVG when local
    // transformation is unsupported; the internal fetcher's 422 is not exposed.
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get('content-type')).toBe('image/svg+xml');
    expect(fallback.headers.get('cf-resized')).toBeNull();
    expect(await fallback.text()).toBe(svg.toString());
    records.push({kind:'cf-image',width:6,height:8,svgPassedThrough:true});
  },30000);
});
