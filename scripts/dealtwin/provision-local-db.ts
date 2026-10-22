import {Pool} from 'pg';
import {applyTestMigrations,requiredTestDatabaseUrl} from '../../tests/dealtwin/postgres/harness';
// One-time setup of a NEW, empty loopback dealtwin_test database owned by DEALTWIN_TEST_DATABASE_URL.
// The disposable-URL guard rejects any non-loopback host, other database name or port.
// Seeding is a separate step (judge:seed) so a preserved demo state is never reset here.
const url=requiredTestDatabaseUrl();
const pool=new Pool({connectionString:url,max:1});
try{
 const tables=await pool.query<{count:number}>("select count(*)::int count from information_schema.tables where table_schema='public'");
 if(tables.rows[0]!.count!==0)throw new Error('EXPECTED_EMPTY_NEW_DATABASE: dealtwin_test already has tables; use npm run judge:seed to reset only the synthetic tenant.');
}finally{await pool.end();}
await applyTestMigrations(url);
console.log('DealTwin schema, RLS policies and least-privilege login roles installed. Next: npm run judge:seed');
