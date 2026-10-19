import assert from 'node:assert/strict';
import path from 'node:path';

export function assertIdentity(actual, expected) {
 assert.equal(actual.database,'dealtwin_test','DATABASE_IDENTITY');
 assert.equal(actual.address,'127.0.0.1','LOOPBACK_REQUIRED');
 assert.equal(Number(actual.port),expected.port,'PORT_IDENTITY');
 assert.equal(path.resolve(actual.dataDirectory).toLowerCase(),path.resolve(expected.dataDirectory).toLowerCase(),'CLUSTER_IDENTITY');
 assert.equal(Math.floor(Number(actual.version)/10000),15,'MAJOR_IDENTITY');
 assert.equal(actual.readOnly,expected.port===55632?'on':'off','SOURCE_READ_ONLY');
}
export const identitySql = `select current_database() database,host(inet_server_addr()) address,inet_server_port() port,
 current_setting('data_directory') "dataDirectory",current_setting('server_version_num') version,
 current_setting('default_transaction_read_only') "readOnly"`;

// Validate the exact known synthetic fixture boundary before writing row evidence or dumping.
export function assertSynthetic(snapshot, allowedTables) {
 assert.deepEqual(Object.keys(snapshot.rows).sort(),[...allowedTables].sort(),'UNEXPECTED_TABLE_SET');
 assert.equal(snapshot.rows.erp_tenants.length,1,'TENANT_COUNT');
 assert.equal(snapshot.rows.erp_tenants[0].row.id,'dealtwin-judge-v1','SYNTHETIC_TENANT');
 for(const rows of Object.values(snapshot.rows))for(const {row} of rows){
  if('tenant_id' in row)assert.equal(row.tenant_id,'dealtwin-judge-v1','FOREIGN_TENANT');
 }
 for(const [table,id,name,email] of [
  ['erp_customers','judge-customer-a','Synthetic Judge Customer','judge-customer@example.invalid'],
  ['erp_suppliers','judge-supplier-a','Synthetic Judge Supplier','judge-supplier@example.invalid'],
 ]){
  assert.equal(snapshot.rows[table].length,1,'MASTER_COUNT');
  const row=snapshot.rows[table][0].row;
  assert.equal(row.id,id,'MASTER_ID');
  const value=row.payload??row;
  assert.equal(value.name,name,'SYNTHETIC_NAME');assert.equal(value.email,email,'SYNTHETIC_EMAIL');
  assert.equal(value.address,'Synthetic','SYNTHETIC_ADDRESS');assert.equal(value.phone,'-','SYNTHETIC_PHONE');
 }
}

const roles=['anon','authenticated','dealtwin','dealtwin_app','dealtwin_app_login','dealtwin_judge_reset','dealtwin_reset_login','service_role'];
export function targetRoleSql(catalog) {
 assert.deepEqual(catalog.roles.map(r=>r.rolname).sort(),roles,'UNEXPECTED_ROLES');
 const statements=[];
 for(const role of catalog.roles){
  const owner=role.rolname==='dealtwin';
  assert.equal(role.rolsuper,owner,'ROLE_SUPERUSER');
  assert.equal(role.rolbypassrls,owner,'ROLE_BYPASS');
  assert.equal(role.rolcreatedb,owner,'ROLE_CREATEDB');
  assert.equal(role.rolcreaterole,owner,'ROLE_CREATEROLE');
  assert.equal(role.rolreplication,owner,'ROLE_REPLICATION');
  assert.equal(role.rolinherit,true,'ROLE_INHERIT');
  assert.equal(role.rolcanlogin,owner||role.rolname.endsWith('_login'),'ROLE_LOGIN');
  if(owner)continue;
  const login=role.rolcanlogin?`login password '${role.rolname}'`:'nologin';
  statements.push(`create role ${role.rolname} ${login} nosuperuser nocreatedb nocreaterole noreplication nobypassrls inherit;`);
 }
 const expected=[{role:'dealtwin_app',member:'dealtwin_app_login',admin_option:false},{role:'dealtwin_judge_reset',member:'dealtwin_reset_login',admin_option:false}];
 const custom=catalog.memberships.filter(r=>!r.role.startsWith('pg_')||!r.member.startsWith('pg_'));
 assert.deepEqual(custom,expected,'UNEXPECTED_MEMBERSHIPS');
 for(const row of catalog.memberships.filter(r=>r.role.startsWith('pg_')&&r.member.startsWith('pg_'))){
  assert.ok(['pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables'].includes(row.role),'BUILTIN_ROLE');
  assert.equal(row.member,'pg_monitor','BUILTIN_MEMBER');assert.equal(row.admin_option,false,'BUILTIN_ADMIN');
 }
 for(const row of expected)statements.push(`grant ${row.role} to ${row.member};`);
 return statements.join('\n');
}
