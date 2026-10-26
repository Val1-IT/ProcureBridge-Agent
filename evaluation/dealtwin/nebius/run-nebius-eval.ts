import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {NemotronConstraintExtractor} from '../../../lib/dealtwin/ai/constraint-extractor';
import {NEMOTRON_THINKING,NemotronClient} from '../../../lib/dealtwin/ai/nemotron-client';
import {oracleProvider,runExtractionEval} from './extraction-eval';
import {runExplanationEval,templateProvider} from './explanation-eval';
import {heldoutCases} from './heldout-cases';
/** Usage: npm run eval:nebius -- [--offline|--live] [--set tuning|heldout|explain]
 * --offline  answers from the human labels (or the template); checks the harness only.
 * --live     calls Nebius Token Factory. Needs NEBIUS_API_KEY, a Nemotron
 *            NEBIUS_MODEL and DEALTWIN_NEBIUS_LIVE_ENABLED=true, and writes the
 *            report under docs/dealtwin/evidence/.
 * --set      tuning (default): the 32 cases prompt v3 was tuned on; heldout: 26
 *            cases written after the prompt froze; explain: verdict explanations.
 * With neither flag, or with --live but no authorization, it reports NOT_RUN. */
const argv=process.argv.slice(2),args=new Set(argv);
const live=args.has('--live'),offline=args.has('--offline');
const set=argv.includes('--set')?argv[argv.indexOf('--set')+1]:'tuning';
if(live&&offline)throw new Error('Choose --offline or --live, not both.');
if(set!=='tuning'&&set!=='heldout'&&set!=='explain')throw new Error('--set must be tuning, heldout or explain.');
const authorized=process.env.DEALTWIN_NEBIUS_LIVE_ENABLED==='true'&&!!process.env.NEBIUS_API_KEY&&!!process.env.NEBIUS_MODEL;
if(!offline&&!(live&&authorized)){
 console.log(JSON.stringify({status:'NOT_RUN',reason:live?'Live provider is not authorized: set NEBIUS_API_KEY, NEBIUS_MODEL and DEALTWIN_NEBIUS_LIVE_ENABLED=true.':'Pass --offline for the harness check or --live for a Nebius run.'}));
}else{
 const client=()=>new NemotronClient({apiKey:process.env.NEBIUS_API_KEY??'',model:process.env.NEBIUS_MODEL??'',enabled:true});
 const write=(name:string,startedAt:string,rendered:string)=>{
  const directory=join(process.cwd(),'docs','dealtwin','evidence');mkdirSync(directory,{recursive:true});
  const path=join(directory,`${name}-${startedAt.replace(/[:.]/g,'-')}.json`);writeFileSync(path,rendered+'\n');console.log(`Wrote ${path}`);
 };
 if(set==='explain'){
  const report=await runExplanationEval(offline?templateProvider():client(),{mode:offline?'offline-template':'live'});
  if(live)write('nebius-explanation-eval',report.startedAt,JSON.stringify(report,null,1));
  console.log(JSON.stringify({mode:report.mode,model:report.model,summary:report.summary},null,1));
  for(const row of report.cases.filter(row=>!row.accepted))console.log(`FALLBACK ${row.id}/${row.language}: ${row.errorCode}`);
 }else{
  const cases=set==='heldout'?heldoutCases:undefined;
  const provider=offline?oracleProvider(cases):client();
  const report=await runExtractionEval(new NemotronConstraintExtractor(provider),{...(offline?{mode:'offline-oracle' as const}:{mode:'live' as const,thinking:NEMOTRON_THINKING}),caseSet:set,...(cases?{cases}:{})});
  if(live)write(set==='heldout'?'nebius-extraction-heldout-eval':'nebius-extraction-eval',report.startedAt,JSON.stringify(report,null,1));
  console.log(JSON.stringify({mode:report.mode,caseSet:report.caseSet,model:report.model,summary:report.summary},null,1));
  for(const row of report.cases.filter(row=>!row.pass))console.log(`FAIL ${row.id}: ${row.status}${row.errorCode?' '+row.errorCode:''} tp=${row.truePositives} fp=${row.falsePositives} fn=${row.falseNegatives}`);
 }
}
