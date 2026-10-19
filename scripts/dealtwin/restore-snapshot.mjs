import assert from 'node:assert/strict';

const queries={
 tables:"select c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','S','v') order by c.relname",
 columns:"select table_name,column_name,ordinal_position,column_default,is_nullable,data_type,udt_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position",
 constraints:"select c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by relation,c.conname",
 policies:"select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
 triggers:"select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname",
 functions:"select p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname,args",
 indexes:"select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname",
 grants:"select grantee,table_name,privilege_type,is_grantable from information_schema.table_privileges where table_schema='public' order by grantee,table_name,privilege_type",
 schemas:"select nspname,pg_get_userbyid(nspowner) owner,nspacl::text from pg_namespace where nspname='public'",
 roles:"select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname not like 'pg_%' order by rolname",
 memberships:"select r.rolname role,m.rolname member,a.admin_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member order by role,member",
 sequences:"select sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value from pg_sequences where schemaname='public' order by sequencename",
};
export async function snapshot(pool){
 const client=await pool.connect();
 try{
  await client.query('begin isolation level repeatable read read only');
  const rows={};
  for(const {tablename} of (await client.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows){
   assert.match(tablename,/^[a-z0-9_]+$/);
   rows[tablename]=(await client.query(`select to_jsonb(t) row from public.${tablename} t order by to_jsonb(t)::text`)).rows;
  }
  const catalog={};for(const [name,sql] of Object.entries(queries))catalog[name]=(await client.query(sql)).rows;
  await client.query('commit');return {rows,catalog};
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}
// Dump reparsing can flatten associative CHECK nodes. Reparse BOTH definitions
// using the same target parser; retain all constraints and every raw snapshot.
// This uses temporary tables only on the fresh target, never on the source.
export async function normalizeChecksOnTarget(pool, value){
 const result=structuredClone(value), client=await pool.connect();
 try{
  for(const row of result.catalog.constraints){
   if(!row.definition.startsWith('CHECK '))continue;
   assert.match(row.relation,/^[a-z0-9_]+$/);
   await client.query(`create temp table restore_constraint_probe (like public.${row.relation})`);
   try{
    await client.query(`alter table restore_constraint_probe add constraint canonical_check ${row.definition}`);
    row.definition=(await client.query("select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='pg_temp.restore_constraint_probe'::regclass and conname='canonical_check'")).rows[0].definition;
   }finally{await client.query('drop table pg_temp.restore_constraint_probe');}
  }
 }finally{client.release();}
 return result;
}
