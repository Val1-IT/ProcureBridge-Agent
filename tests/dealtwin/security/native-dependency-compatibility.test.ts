import {createRequire} from 'node:module';
import {describe,expect,it} from 'vitest';

const require=createRequire(import.meta.url);
const nextRequire=createRequire(require.resolve('next/package.json'));
interface ImagePipeline {
  resize(width:number,height:number):ImagePipeline;
  png():ImagePipeline;
  toBuffer():Promise<Buffer>;
  metadata():Promise<{format:string;width:number;height:number}>;
}
const sharp=nextRequire('sharp') as (input:Buffer)=>ImagePipeline;
const esbuild=require('esbuild') as {transform(source:string,options:Record<string,unknown>):Promise<{code:string;warnings:unknown[]}>};

describe('native dependencies installed without lifecycle scripts',()=>{
  it('decodes a synthetic SVG and resizes/encodes PNG through Next’s own Sharp resolution',async()=>{
    const source=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>');
    const result=await sharp(source).resize(4,3).png().toBuffer();
    expect(result.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(await sharp(result).metadata()).toMatchObject({format:'png',width:4,height:3});
  });

  it('uses the matching esbuild native binary to transform typed source for the existing build target',async()=>{
    const result=await esbuild.transform('export const amount: bigint = 25n;',{
      loader:'ts',target:'es2020',format:'esm',minify:false,
    });
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('25n');
    expect(result.code).not.toContain(': bigint');
    expect(result.code).toContain('export');
  });
});
