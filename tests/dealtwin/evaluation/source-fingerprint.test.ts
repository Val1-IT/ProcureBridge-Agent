import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {sourceFingerprint} from '../../../evaluation/dealtwin/report';
it('fingerprints actual ERP persistence and money mapper dependencies',()=>{
 const root=mkdtempSync(join(tmpdir(),'dealtwin-fingerprint-'));execFileSync('git',['init','--quiet'],{cwd:root});
 mkdirSync(join(root,'lib/repository/mappers'),{recursive:true});mkdirSync(join(root,'lib/demo'),{recursive:true});
 const mapper=join(root,'lib/repository/mappers/trade-invoice.ts'),validator=join(root,'lib/demo/persistence.ts');
 writeFileSync(mapper,'export const amount = 1;');writeFileSync(validator,'export const valid = true;');
 const initial=sourceFingerprint(root);writeFileSync(mapper,'export const amount = 2;');const mapped=sourceFingerprint(root);
 expect(mapped).not.toBe(initial);writeFileSync(validator,'export const valid = false;');expect(sourceFingerprint(root)).not.toBe(mapped);
});
