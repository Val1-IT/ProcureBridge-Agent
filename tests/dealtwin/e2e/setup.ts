import {mkdir,writeFile} from 'node:fs/promises';
import {bootstrapLocalJudge} from '../../../scripts/dealtwin/bootstrap';
export default async function setup(){
 const auth=await bootstrapLocalJudge(false);
 await mkdir('output/playwright/task24/auth',{recursive:true});
 for(const role of ['admin','approver'] as const)await writeFile('output/playwright/task24/auth/'+role+'.json',JSON.stringify(auth[role]));
}
