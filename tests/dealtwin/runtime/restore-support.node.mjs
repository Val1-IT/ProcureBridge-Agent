import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertIdentity,assertSynthetic,targetRoleSql} from '../../../scripts/dealtwin/restore-support.mjs';
const expected={port:55632,dataDirectory:'C:\\fixture\\source'};
const identity={database:'dealtwin_test',address:'127.0.0.1',port:55632,dataDirectory:expected.dataDirectory,version:'150004',readOnly:'on'};
test('source requires exact cluster, loopback, major and read-only sessions',()=>assertIdentity(identity,expected));
for(const [key,value] of Object.entries({database:'other',address:'0.0.0.0',port:55432,dataDirectory:'C:\\other',version:'160000',readOnly:'off'}))test('rejects wrong '+key,()=>assert.throws(()=>assertIdentity({...identity,[key]:value},expected)));
const master=(id,name,email)=>({row:{id,tenant_id:'dealtwin-judge-v1',payload:{name,email,address:'Synthetic',phone:'-'}}});
const fixture=()=>({rows:{erp_tenants:[{row:{id:'dealtwin-judge-v1'}}],erp_customers:[master('judge-customer-a','Synthetic Judge Customer','judge-customer@example.invalid')],erp_suppliers:[master('judge-supplier-a','Synthetic Judge Supplier','judge-supplier@example.invalid')]}});
test('accepts only the known synthetic masters and tenant',()=>{const s=fixture();assertSynthetic(s,Object.keys(s.rows));});
test('rejects extra tables, foreign tenants and non-fixture contact data',()=>{
 const s=fixture();assert.throws(()=>assertSynthetic(s,['erp_tenants']));
 s.rows.erp_customers[0].row.tenant_id='foreign';assert.throws(()=>assertSynthetic(s,Object.keys(s.rows)));
 s.rows.erp_customers[0].row.tenant_id='dealtwin-judge-v1';s.rows.erp_customers[0].row.payload.email='different@example.invalid';assert.throws(()=>assertSynthetic(s,Object.keys(s.rows)));
});
function catalog(){return {roles:['anon','authenticated','dealtwin','dealtwin_app','dealtwin_app_login','dealtwin_judge_reset','dealtwin_reset_login','service_role'].map(rolname=>({rolname,rolsuper:rolname==='dealtwin',rolbypassrls:rolname==='dealtwin',rolcreatedb:rolname==='dealtwin',rolcreaterole:rolname==='dealtwin',rolreplication:rolname==='dealtwin',rolinherit:true,rolcanlogin:rolname==='dealtwin'||rolname.endsWith('_login')})),memberships:[{role:'dealtwin_app',member:'dealtwin_app_login',admin_option:false},{role:'dealtwin_judge_reset',member:'dealtwin_reset_login',admin_option:false}]};}
test('creates only missing target roles and fixed synthetic login memberships',()=>{const sql=targetRoleSql(catalog());assert.equal((sql.match(/create role/g)||[]).length,7);assert.ok(!sql.includes('create role dealtwin '));assert.ok(!/drop |alter /i.test(sql));});
test('rejects elevated application roles or unexpected memberships',()=>{const c=catalog();c.roles[0].rolsuper=true;assert.throws(()=>targetRoleSql(c));const d=catalog();d.memberships.push({role:'dealtwin',member:'dealtwin_app_login',admin_option:true});assert.throws(()=>targetRoleSql(d));});
