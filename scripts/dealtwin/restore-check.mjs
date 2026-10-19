import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {Pool} from 'pg';
import {assertIdentity,assertSynthetic,identitySql,targetRoleSql} from './restore-support.mjs';
import {snapshot,normalizeChecksOnTarget} from './restore-snapshot.mjs';

const [phase,folder]=process.argv.slice(2);
assert.ok(['source','source-after','target-roles','compare'].includes(phase),'UNKNOWN_PHASE');
const evidence=path.resolve(folder);
const plan=JSON.parse(readFileSync(path.join(evidence,'plan.json'),'utf8'));
assert.equal(evidence,plan.evidenceDirectory);
const marker=JSON.parse(readFileSync(plan.ownership.ownerMarker,'utf8'));
assert.equal(marker.target,plan.target.dataDirectory);assert.equal(marker.runId,plan.runId);
assert.equal(marker.authorized,true);assert.equal(marker.owner,'LENOVO-VT\\Valen');
const source=phase.startsWith('source');
const expected=source?plan.source:plan.target;
const pool=new Pool({host:'127.0.0.1',port:expected.port,database:'dealtwin_test',user:'dealtwin',
 password:source?'dealtwin':process.env.RESTORE_TARGET_PASSWORD,max:1,connectionTimeoutMillis:5000,
 options:source?'-c default_transaction_read_only=on':undefined});
const save=(name,value)=>writeFileSync(path.join(evidence,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
try{
 const identity=(await pool.query(identitySql)).rows[0];assertIdentity(identity,expected);save(phase+'-identity',identity);
 if(source){
  assert.deepEqual((await pool.query("select datname from pg_database where not datistemplate order by datname")).rows.map(r=>r.datname),['dealtwin_test','postgres'],'UNEXPECTED_DATABASE');
  assert.deepEqual((await pool.query("select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema' order by nspname")).rows.map(r=>r.nspname),['public'],'UNEXPECTED_SCHEMA');
  assert.equal(Number((await pool.query('select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()')).rows[0].count),0,'SOURCE_IN_USE');
  const current=await snapshot(pool);
  const migrations=readdirSync(path.join(plan.workspace,'supabase/migrations')).filter(n=>n.endsWith('.sql')).map(n=>readFileSync(path.join(plan.workspace,'supabase/migrations',n),'utf8')).join('\n');
  const tables=[...new Set([...migrations.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)/gi)].map(m=>m[1]))];
  assertSynthetic(current,tables);
  targetRoleSql(current.catalog); // Reject unexpected/elevated source roles before dump.
  if(phase==='source-after')assert.deepEqual(current,JSON.parse(readFileSync(path.join(evidence,'source-snapshot.json'),'utf8')),'SOURCE_CHANGED');
  save(phase+'-snapshot',current);
  console.log(JSON.stringify({phase,status:'pass',tableCount:Object.keys(current.rows).length,rowCounts:Object.fromEntries(Object.entries(current.rows).map(([name,rows])=>[name,rows.length]))}));
 }else if(phase==='target-roles'){
  assert.equal((await pool.query("select tablename from pg_tables where schemaname='public'")).rowCount,0,'TARGET_NOT_EMPTY');
  assert.deepEqual((await pool.query("select rolname from pg_roles where rolname not like 'pg_%' order by rolname")).rows,[{rolname:'dealtwin'}],'TARGET_NOT_FRESH');
  const original=JSON.parse(readFileSync(path.join(evidence,'source-snapshot.json'),'utf8'));
  assert.deepEqual(original.catalog.schemas.map(r=>({name:r.nspname,owner:r.owner})),[{name:'public',owner:'dealtwin'}]);
  await pool.query('begin');
  try{await pool.query(targetRoleSql(original.catalog));await pool.query('alter schema public owner to dealtwin');await pool.query('commit');}
  catch(error){await pool.query('rollback');throw error;}
  // Preserve the pre-existing EMPTY bootstrap public schema, restoring its ACL
  // from the dump. Do not drop schema or suppress any table/constraint entry.
  const toc=readFileSync(path.join(evidence,'dump-list.txt'),'utf8');
  const lines=toc.split(/\r?\n/), schema=lines.filter(line=>/^\d+; \d+ \d+ SCHEMA - public dealtwin$/.test(line));
  assert.equal(schema.length,1,'UNEXPECTED_SCHEMA_TOC');
  writeFileSync(path.join(evidence,'restore-list.txt'),lines.map(line=>line===schema[0]?'; retained empty bootstrap schema: '+line:line).join('\n'),{flag:'wx'});
  console.log('Fresh target roles prepared; only bootstrap schema creation excluded from TOC.');
 }else{
  const original=JSON.parse(readFileSync(path.join(evidence,'source-snapshot.json'),'utf8'));
  const restored=await snapshot(pool);save('restored-snapshot',restored);
  assert.deepEqual(await normalizeChecksOnTarget(pool,restored),await normalizeChecksOnTarget(pool,original),'RESTORE_MISMATCH');
  save('comparison',{status:'pass',tableCount:Object.keys(restored.rows).length,catalogSections:Object.keys(restored.catalog),allRowsEqual:true,allCatalogsEqualAfterServerCheckParsing:true});
  console.log('All rows and catalog sections match.');
 }
}finally{await pool.end();}
