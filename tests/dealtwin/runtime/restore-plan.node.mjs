import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdirSync,mkdtempSync,writeFileSync,existsSync,readdirSync,readFileSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import {planWindowsRestore} from '../../../scripts/dealtwin/restore-plan.mjs';

const fixtures=path.resolve('output/restore-plan-tests');
mkdirSync(fixtures,{recursive:true});
function fixture(major='15') {
 const workspace=mkdtempSync(path.join(fixtures,'case-'));
 const source=path.join(workspace,'.cache','pg-browser-20261018');
 const binaries=path.join(workspace,'postgres-bin');
 mkdirSync(source,{recursive:true});mkdirSync(path.join(workspace,'output'));mkdirSync(binaries);
 writeFileSync(path.join(source,'PG_VERSION'),major+'\n');
 for(const name of ['initdb','pg_ctl','pg_dump','pg_restore','createdb','psql'])writeFileSync(path.join(binaries,name+'.exe'),'inert test placeholder');
 return {workspace,source,binaries};
}
test('plans a new isolated target without creating or changing any fixture',()=>{
 const {workspace,source,binaries}=fixture();
 const before=readdirSync(path.join(workspace,'.cache'));
 const result=planWindowsRestore(workspace,'review-a',binaries);
 assert.equal(result.executionAuthorized,false);
 assert.equal(result.source.port,55632);assert.equal(result.target.port,55432);
 assert.equal(result.source.database,'dealtwin_test');assert.equal(result.target.database,'dealtwin_test');
 assert.equal(result.source.dataDirectory,source);
 assert.equal(result.target.dataDirectory,path.join(workspace,'.cache','pg-restore-review-a'));
 assert.equal(existsSync(result.target.dataDirectory),false);
 assert.equal(existsSync(result.evidenceDirectory),false);
 assert.deepEqual(readdirSync(path.join(workspace,'.cache')),before);
 assert.equal(readFileSync(path.join(source,'PG_VERSION'),'utf8'),'15\n');
 const restore=result.commands.find(row=>row.id==='restore');
 assert.ok(restore.args.includes('55432'));assert.ok(!restore.args.includes('55632'));
 assert.ok(restore.args.includes('--exit-on-error'));assert.ok(restore.args.includes('--single-transaction'));
 assert.ok(!restore.args.includes('--clean'));
 assert.equal(result.listenerAvailability,'NOT_CHECKED');
 assert.ok(result.pending.includes('AUTHORIZE_NEW_DISPOSABLE_FIXTURE'));
});
for(const runId of ['../source','a/b','A','a b','x'.repeat(33),''])test('rejects invalid run ID '+JSON.stringify(runId),()=>{
 const f=fixture();assert.throws(()=>planWindowsRestore(f.workspace,runId,f.binaries),/INVALID_RUN_ID/);
});
for(const location of ['target','evidence'])test('preserves and rejects existing '+location,()=>{
 const f=fixture();const p=location==='target'?path.join(f.workspace,'.cache','pg-restore-review-a'):path.join(f.workspace,'output','restore-review-a');
 mkdirSync(p);writeFileSync(path.join(p,'keep.txt'),'preserve');
 assert.throws(()=>planWindowsRestore(f.workspace,'review-a',f.binaries),/DESTINATION_EXISTS/);
 assert.equal(readFileSync(path.join(p,'keep.txt'),'utf8'),'preserve');
});
test('rejects a mismatched source PostgreSQL major',()=>{
 const f=fixture('16');assert.throws(()=>planWindowsRestore(f.workspace,'review-a',f.binaries),/SOURCE_MAJOR_MISMATCH/);
});
test('rejects absent source and missing binaries',()=>{
 const f=fixture();const other=mkdtempSync(path.join(fixtures,'empty-'));
 assert.throws(()=>planWindowsRestore(other,'review-a',f.binaries),/SOURCE_REQUIRED/);
 assert.throws(()=>planWindowsRestore(f.workspace,'review-a',path.join(f.workspace,'absent-bin')),/BINARY_REQUIRED/);
});
test('rejects redirected target parent without writing through it',()=>{
 const workspace=mkdtempSync(path.join(fixtures,'redirect-'));const f=fixture();
 symlinkSync(path.join(f.workspace,'.cache'),path.join(workspace,'.cache'),'junction');
 mkdirSync(path.join(workspace,'output'));
 assert.throws(()=>planWindowsRestore(workspace,'review-a',f.binaries),/REDIRECTED_PATH/);
 assert.equal(existsSync(path.join(f.workspace,'.cache','pg-restore-review-a')),false);
});
