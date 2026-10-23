import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {NemotronConstraintExtractor} from '../../../lib/dealtwin/ai/constraint-extractor';
import {NEMOTRON_THINKING,NemotronClient} from '../../../lib/dealtwin/ai/nemotron-client';
import {oracleProvider,runExtractionEval} from './extraction-eval';
/** Usage: npm run eval:nebius -- [--offline|--live]
 * --offline  answers from the human labels; checks the harness only.
 * --live     calls Nebius Token Factory. Needs NEBIUS_API_KEY, a Nemotron
 *            NEBIUS_MODEL and DEALTWIN_NEBIUS_LIVE_ENABLED=true, and writes the
 *            report under docs/dealtwin/evidence/.
 * With neither flag, or with --live but no authorization, it reports NOT_RUN. */
const args=new Set(process.argv.slice(2));
const live=args.has('--live'),offline=args.has('--offline');
if(live&&offline)throw new Error('Choose --offline or --live, not both.');
const authorized=process.env.DEALTWIN_NEBIUS_LIVE_ENABLED==='true'&&!!process.env.NEBIUS_API_KEY&&!!process.env.NEBIUS_MODEL;
if(!offline&&!(live&&authorized)){
 console.log(JSON.stringify({status:'NOT_RUN',reason:live?'Live provider is not authorized: set NEBIUS_API_KEY, NEBIUS_MODEL and DEALTWIN_NEBIUS_LIVE_ENABLED=true.':'Pass --offline for the harness check or --live for a Nebius run.'},null,1));
}else{
 const provider=offline?oracleProvider():new NemotronClient({apiKey:process.env.NEBIUS_API_KEY??'',model:process.env.NEBIUS_MODEL??'',enabled:true});
 const report=await runExtractionEval(new NemotronConstraintExtractor(provider),offline?{mode:'offline-oracle'}:{mode:'live',thinking:NEMOTRON_THINKING});
 const rendered=JSON.stringify(report,null,1);
 if(live){
  const directory=join(process.cwd(),'docs','dealtwin','evidence');mkdirSync(directory,{recursive:true});
  const path=join(directory,`nebius-extraction-eval-${report.startedAt.replace(/[:.]/g,'-')}.json`);writeFileSync(path,rendered+'\n');
  console.log(`Wrote ${path}`);
 }
 console.log(JSON.stringify({mode:report.mode,model:report.model,summary:report.summary},null,1));
 for(const row of report.cases.filter(row=>!row.pass))console.log(`FAIL ${row.id}: ${row.status}${row.errorCode?' '+row.errorCode:''} tp=${row.truePositives} fp=${row.falsePositives} fn=${row.falseNegatives}`);
}
