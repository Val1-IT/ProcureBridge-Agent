import {afterEach,expect,it,vi} from 'vitest';
import {mkdirSync,readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {runBenchmarkCommand} from '../../../evaluation/dealtwin/report';

// Refuse the database boundary outright: this regression must not open a socket
// or reset the disposable fixture just to prove output reservation ordering.
vi.mock('../../../lib/server/postgres/pool',()=>({
 createPostgresPool:()=>{throw new Error('DATABASE_BOUNDARY_REACHED');},
 createIndependentPostgresPool:()=>{throw new Error('DATABASE_BOUNDARY_REACHED');},
}));
afterEach(()=>vi.unstubAllEnvs());
function fixture(){
 const id='output-test-'+randomUUID();
 vi.stubEnv('DEALTWIN_BENCHMARK_APP_DATABASE_URL','postgres://dealtwin_app_login:dealtwin_app_login@127.0.0.1:55632/dealtwin_test');
 vi.stubEnv('DEALTWIN_BENCHMARK_RESET_DATABASE_URL','postgres://dealtwin_reset_login:dealtwin_reset_login@127.0.0.1:55632/dealtwin_test');
 return {folder:join(process.cwd(),'output/dealtwin/task27',id),args:['--count','1','--run-id',id]};
}
it.each(['completed','incomplete'])('rejects a reused %s output directory before database side effects',async state=>{
 const {folder,args}=fixture();mkdirSync(folder,{recursive:true});
 if(state==='completed')writeFileSync(join(folder,'report.json'),'preserved prior evidence');
 const before=readdirSync(folder);
 await expect(runBenchmarkCommand(args)).rejects.toMatchObject({code:'EEXIST'});
 expect(readdirSync(folder)).toEqual(before);
 if(state==='completed')expect(readFileSync(join(folder,'report.json'),'utf8')).toBe('preserved prior evidence');
});
it('reserves a new output directory before service work and retains it on failure',async()=>{
 const {folder,args}=fixture();
 await expect(runBenchmarkCommand(args)).rejects.toThrow('DATABASE_BOUNDARY_REACHED');
 expect(existsSync(folder)).toBe(true);
 expect(readdirSync(folder)).toEqual([]);
});
