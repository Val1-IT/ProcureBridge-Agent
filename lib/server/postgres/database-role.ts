import type { PoolClient } from 'pg';
/** Refuse owner/bypass logins and mixed reset/application credentials. */
export async function assertDatabaseRole(tx: PoolClient, role: 'dealtwin_app' | 'dealtwin_judge_reset'): Promise<void> {
  const opposite=role==='dealtwin_app'?'dealtwin_judge_reset':'dealtwin_app';
  const result=await tx.query<{ allowed:boolean }>(`select
    (not r.rolsuper and not r.rolbypassrls and r.rolinherit
      and pg_has_role(current_user,$1,'MEMBER') and not pg_has_role(current_user,$2,'MEMBER')
      and not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and (c.relname like 'erp_%' or c.relname like 'dealtwin_%')
        and pg_has_role(current_user,c.relowner,'MEMBER'))) as allowed
    from pg_roles r where r.rolname=current_user`,[role,opposite]);
  if (result.rows[0]?.allowed!==true) throw new Error('Judge requires separate least-privilege app/reset credentials, not owner or bypass roles.');
}
