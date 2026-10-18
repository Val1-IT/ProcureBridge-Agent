import {mkdir,writeFile} from 'node:fs/promises';
import {evidencePath} from '../evidence-path';
const evidence=evidencePath('playwright','output/playwright/task24');
import {bootstrapLocalJudge} from '../../../scripts/dealtwin/bootstrap';
export default async function setup(){
 const auth=await bootstrapLocalJudge(false);
 await mkdir(evidence+'/auth',{recursive:true});
 for(const role of ['admin','approver'] as const)await writeFile(evidence+'/auth/'+role+'.json',JSON.stringify(auth[role]));
}
