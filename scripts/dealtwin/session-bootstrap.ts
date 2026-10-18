import {mkdir,writeFile} from 'node:fs/promises';
import {bootstrapLocalJudge} from './bootstrap';
const auth=await bootstrapLocalJudge(false);
await mkdir('output/playwright/demo/auth',{recursive:true});
for(const role of ['admin','approver'] as const)await writeFile('output/playwright/demo/auth/'+role+'.json',JSON.stringify(auth[role]));
console.log('Private local admin/approver auth files generated under output/playwright/demo/auth. Live synthetic state preserved; sessions expire in one hour.');
