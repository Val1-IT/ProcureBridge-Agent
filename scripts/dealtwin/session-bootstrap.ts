import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {bootstrapLocalJudge} from './bootstrap';
const authFolder=process.env.DEALTWIN_TEST_EVIDENCE_ROOT?resolve(process.env.DEALTWIN_TEST_EVIDENCE_ROOT,'demo/auth'):resolve('output/playwright/demo/auth');
const auth=await bootstrapLocalJudge(false);
await mkdir(authFolder,{recursive:true});
for(const role of ['admin','approver'] as const)await writeFile(resolve(authFolder,role+'.json'),JSON.stringify(auth[role]));
console.log('Private local admin/approver auth files generated. Live synthetic state preserved; sessions expire in one hour.');
