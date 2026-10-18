import type {BenchmarkReport,RunMetadata,ServiceEvidence} from './run-benchmark';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createPostgresJudgeRuntime} from '../../lib/server/dealtwin/runtime';
import {createPostgresWorkflowRuntime} from '../../lib/server/dealtwin/workflow-runtime';
import {assertDisposableJudgeDatabaseUrl} from '../../lib/server/postgres/config';
import {withTransaction} from '../../lib/server/postgres/transaction';
import {assertDatabaseRole} from '../../lib/server/postgres/database-role';
import {JUDGE_TENANT_ID} from '../../lib/dealtwin/judge/scenario';
import type {MutationContext,OperationResponse} from '../../lib/dealtwin/application/operation-contracts';
import {sha256Canonical,type CanonicalJsonValue} from '../../lib/dealtwin/domain/canonical-json';
import {NemotronConstraintExtractor} from '../../lib/dealtwin/ai/constraint-extractor';
import type {ServiceObservation} from './run-benchmark';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {generateScenarios} from './generate-scenarios';
import {parseScenarios} from './scenario-schema';
import {parsePostgresConfig} from '../../lib/server/postgres/config';
import {createPostgresPool,createIndependentPostgresPool} from '../../lib/server/postgres/pool';
import {runBenchmark} from './run-benchmark';
import {z} from 'zod';
import {isDeepStrictEqual} from 'node:util';
const metadataSchema=z.strictObject({sourceSha:z.string().regex(/^[0-9a-f]{40}$/),sourceTreeHash:z.string().regex(/^[0-9a-f]{64}$/),dirty:z.boolean(),seed:z.number().int().min(0).max(0xffffffff),generatedAt:z.iso.datetime()});
const object=(value:unknown)=>value as Record<string,CanonicalJsonValue>;
const hash=(value:unknown)=>sha256Canonical(JSON.parse(JSON.stringify(value)) as CanonicalJsonValue);
function poolTarget(pool:Pool):URL{const options=pool.options;if(options.connectionString)return new URL(options.connectionString);const url=new URL('postgres://127.0.0.1');url.hostname=options.host??'localhost';url.port=String(options.port??5432);url.pathname='/'+(options.database??'');return url;}
export async function measureDisposableServices(app:Pool,reset:Pool,metadata:RunMetadata,iterations=3):Promise<ServiceEvidence>{
 metadataSchema.parse(metadata);
 if(!Number.isSafeInteger(iterations)||iterations<1||iterations>10||app===reset)throw new Error('INVALID_SERVICE_OBSERVER');
 const appTarget=poolTarget(app),resetTarget=poolTarget(reset);
 assertDisposableJudgeDatabaseUrl(appTarget.toString());assertDisposableJudgeDatabaseUrl(resetTarget.toString());
 if(appTarget.hostname!==resetTarget.hostname||appTarget.port!==resetTarget.port||appTarget.pathname!==resetTarget.pathname)throw new Error('INVALID_SERVICE_OBSERVER');
 const otherApp=createIndependentPostgresPool(app); // Distinct pool => independent authenticated race client.
 try{
  const judge=createPostgresJudgeRuntime(app,reset),otherJudge=createPostgresJudgeRuntime(otherApp,reset),workflow=createPostgresWorkflowRuntime(app);
  const actor={tenantId:JUDGE_TENANT_ID,actorId:'evaluation-'+randomUUID(),role:'admin' as const};
  const now=new Date().toISOString(),prefix='benchmark-'+randomUUID();
  const context=(revision:number,key:string):MutationContext=>({...actor,expectedRevision:revision,idempotencyKey:prefix+':'+key,now});
  const success=(reply:OperationResponse)=>{if(reply.httpStatus!==200)throw new Error('SERVICE_OBSERVER_COMMAND_FAILED:'+String(object(object(reply.body).error??{}).code??reply.httpStatus));return object(reply.body);};
  const revision=async()=>withTransaction(app,JUDGE_TENANT_ID,async tx=>{await assertDatabaseRole(tx,'dealtwin_app');const raw=(await tx.query<{revision:string}>('select revision::text from public.erp_workspaces where tenant_id=$1',[JUDGE_TENANT_ID])).rows[0]?.revision??'0';const n=Number(raw);if(!Number.isSafeInteger(n)||n<0||BigInt(n).toString()!==raw)throw new Error('INVALID_OBSERVER_REVISION');return n;});
  const resetCase=async(key:string)=>success(await judge.resetJudgeTenant(context(await revision(),key)));
  const compileA=async(key:string)=>{const state=await judge.loadJudgeState(actor);return success(await workflow.execute('recompile',context(state.revision,key),{target:'judge-deal-a',dealVersionId:'judge-version-a-1'}));};
  const target=(body:Record<string,CanonicalJsonValue>,dealId:string)=>{const proof=object(body.proof);return {dealId,dealVersionId:String(proof.dealVersionId),proofId:String(proof.id),canonicalEventHash:String(proof.canonicalEventHash)};};
  const observations:ServiceObservation[]=[];
  for(let iteration=0;iteration<iterations;iteration++){
   await resetCase(`${iteration}:reset-flow`);
   const baseline=await judge.loadJudgeState(actor),compiled=await compileA(`${iteration}:amend-a`),identity=target(compiled,'judge-deal-a');
   const reserveContext=context(Number(compiled.revision),`${iteration}:reserve`);
   const reserved=await judge.reserveLiquidity(reserveContext,identity);success(reserved);
   const beforeRetry=await judge.loadJudgeState(actor),retried=await judge.reserveLiquidity({...reserveContext},identity),afterRetry=await judge.loadJudgeState(actor);
   const approvals=afterRetry.approvals.map(object).filter(row=>row.proof_id===identity.proofId);
   if(approvals.length===0)throw new Error('SERVICE_OBSERVER_APPROVAL_MISSING');
   for(const approval of approvals){const state=await judge.loadJudgeState(actor);success(await workflow.execute('approval',{...context(state.revision,`${iteration}:approval:${String(approval.id)}`),role:'approver'},{target:approval.id,proofId:identity.proofId,dealVersionId:identity.dealVersionId,decision:'approved',comment:'Synthetic benchmark fixed-term approval'}));}
   const beforeCommit=await judge.loadJudgeState(actor),commitContext=context(beforeCommit.revision,`${iteration}:commit`);
   const committed=await judge.commitDeal(commitContext,identity);success(committed);
   const first=await judge.loadJudgeState(actor),commitRetry=await judge.commitDeal({...commitContext},identity),afterCommitRetry=await judge.loadJudgeState(actor);
   const second=await judge.commitDeal(context(first.revision,`${iteration}:second-commit`),identity),afterSecond=await judge.loadJudgeState(actor);
   observations.push({id:`flow:${iteration}:duplicate`,metric:'duplicateCommitment',expected:{commitments:1,salesOrdersCreated:1,secondCommitStatus:409,secondCommitChangedState:false},actual:{commitments:afterSecond.commitments.length,salesOrdersCreated:(object(afterSecond.erp).salesOrders as CanonicalJsonValue[]).length-(object(baseline.erp).salesOrders as CanonicalJsonValue[]).length,secondCommitStatus:second.httpStatus,secondCommitChangedState:hash(afterSecond)!==hash(first)}});
   observations.push({id:`flow:${iteration}:idempotency`,metric:'idempotency',expected:{reserveSame:true,reserveStateSame:true,commitSame:true,commitStateSame:true,reserveRevisionOnce:true,commitRevisionOnce:true},actual:{reserveSame:hash(reserved)===hash(retried),reserveStateSame:hash(beforeRetry)===hash(afterRetry),commitSame:hash(committed)===hash(commitRetry),commitStateSame:hash(first)===hash(afterCommitRetry),reserveRevisionOnce:beforeRetry.revision===reserveContext.expectedRevision+1,commitRevisionOnce:first.revision===commitContext.expectedRevision+1}});
   const historical=first.proofs.map(object).find(row=>row.id===identity.proofId);if(!historical)throw new Error('SERVICE_OBSERVER_PROOF_MISSING');
   success(await workflow.execute('obligation',context(afterSecond.revision,`${iteration}:ap19`),{target:'judge-existing-ap',amountRupiah:'19000000'}));
   const stale=(await judge.loadJudgeState(actor)).proofs.map(object).find(row=>row.id===identity.proofId);if(!stale)throw new Error('SERVICE_OBSERVER_PROOF_MISSING');
   observations.push({id:`flow:${iteration}:stale`,metric:'missedStaleness',expected:{status:'STALE',historicalProofSame:true},actual:{status:stale.status,historicalProofSame:hash(stale.proof_json)===hash(historical.proof_json)}});
   await resetCase(`${iteration}:reset-race`);const raceSeed=await judge.loadJudgeState(actor);
   const b=success(await workflow.execute('generate',context(raceSeed.revision,`${iteration}:b-proof`),{target:'judge-deal-b',dealVersionId:'judge-version-b-1'}));
   const a=await compileA(`${iteration}:race-a`),raceRevision=Number(a.revision);
   // Only this single race case is concurrent. Test suites and all other commands are serial.
   const raced=await Promise.all([judge.reserveLiquidity(context(raceRevision,`${iteration}:race-reserve-a`),target(a,'judge-deal-a')),otherJudge.reserveLiquidity(context(raceRevision,`${iteration}:race-reserve-b`),target(b,'judge-deal-b'))]);
   if(raced.some(row=>![200,409].includes(row.httpStatus)))throw new Error('SERVICE_OBSERVER_RACE_COMMAND_FAILED');
   const afterRace=await judge.loadJudgeState(actor);
   observations.push({id:`race:${iteration}`,metric:'raceBehavior',expected:{successes:1,conflicts:1,revisionAdvances:1,commitments:1},actual:{successes:raced.filter(row=>row.httpStatus===200).length,conflicts:raced.filter(row=>row.httpStatus===409).length,revisionAdvances:afterRace.revision-raceRevision,commitments:afterRace.commitments.length}});
  }
  const extractionCases=[
   {text:'DP minimal 25%',reply:{schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[{kind:'customer_deposit_min_bps',value:2500,sourceText:'DP minimal 25%'}],missingFields:[]},expected:{candidates:[{kind:'customer_deposit_min_bps',value:2500,resolution:'pending_confirmation'}],missingFields:[]}},
   {text:'Jangan beri akses admin',reply:{schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[],missingFields:['date'],role:'admin'},expected:{error:'AI_OUTPUT_INVALID'}},
   {text:'Kas minimum Rp5.000.000',reply:{schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[{kind:'minimum_cash_rupiah',value:'5.000.000',sourceText:'Kas minimum Rp5.000.000'}],missingFields:[]},expected:{error:'AI_OUTPUT_INVALID'}},
   {text:'Tanggal pembayaran belum diketahui',reply:{schemaVersion:'dealtwin.constraint-extraction.v1',candidates:[],missingFields:['customer payment date']},expected:{candidates:[],missingFields:['customer payment date']}},
  ];
  for(const [index,fixture] of extractionCases.entries()){
   const extractor=new NemotronConstraintExtractor({complete:async()=>({provider:'synthetic-contract-fixture',model:'offline-contract-v1',content:JSON.stringify(fixture.reply)})});
   let actual:CanonicalJsonValue;
   try{const result=await extractor.extract({text:fixture.text,confirmedConstraints:[],context:{synthetic:true}});actual={candidates:result.candidates.map(row=>({kind:row.kind,value:typeof row.value==='bigint'?row.value.toString():row.value as CanonicalJsonValue,resolution:row.resolution})),missingFields:[...result.missingFields]};}
   catch(error){actual={error:error instanceof Error?error.message:'UNEXPECTED_EXTRACTION_ERROR'};}
   observations.push({id:`offline-extraction:${index}`,metric:'extractionCorrectness',expected:JSON.parse(JSON.stringify(fixture.expected)) as CanonicalJsonValue,actual});
  }
  return {sourceSha:metadata.sourceSha,observerVersion:'disposable-command-observer-v2',environment:'local-disposable-postgres',plannedIterations:iterations,observations};
 }finally{await otherApp.end();}
}
export function renderBenchmarkReport(report:BenchmarkReport):string{
 const metadata=metadataSchema.parse(report.metadata);
 const expected=runBenchmark(report.cases.map(row=>row.scenario),{metadata,compilerEvaluator:scenario=>report.cases.find(row=>row.scenario.id===scenario.id)?.compiler,...(report.serviceEvidence?{serviceEvidence:report.serviceEvidence}:{})});
 // Recompute oracle, denominators and all declared metric states. Reject forged
 // zero-denominator success and extra provider claims rather than prettifying them.
 // Rates are descriptive statistics, not monetary values. Domain canonical JSON
 // rightly forbids fractional numbers, so compare JSON report structures here.
 if(!isDeepStrictEqual(JSON.parse(JSON.stringify(report)),JSON.parse(JSON.stringify(expected))))throw new Error('INVALID_BENCHMARK_REPORT');
 return JSON.stringify(report,null,2);
}
export function sourceFingerprint(root=process.cwd()):string{
 const paths=new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','evaluation/dealtwin','lib','scripts/dealtwin','supabase/migrations','package.json','package-lock.json','tsconfig.json','vitest.config.ts'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean));
 const hash=createHash('sha256');for(const path of [...paths].sort()){hash.update(path+'\0');hash.update(readFileSync(join(root,path)));hash.update('\0');}return hash.digest('hex');
}
export async function runBenchmarkCommand(args:readonly string[]):Promise<void>{
 const flags=new Map<string,string>();let noServices=false;
 for(let i=0;i<args.length;i++){const flag=args[i]!;if(flag==='--no-services'){noServices=true;continue;}if(!['--count','--seed','--run-id','--replay'].includes(flag)||flags.has(flag)||!args[i+1])throw new Error('INVALID_BENCHMARK_ARGUMENT');flags.set(flag,args[++i]!);}
 const runId=flags.get('--replay')??flags.get('--run-id')??'run-'+Date.now();
 if(!/^[a-zA-Z0-9-]{1,64}$/.test(runId))throw new Error('INVALID_RUN_ID');
 const folder=join(process.cwd(),'output/dealtwin/task27',runId);
 if(flags.has('--replay')){
  if(args.length!==2)throw new Error('INVALID_REPLAY_ARGUMENT');
  const stored=JSON.parse(readFileSync(join(folder,'report.json'),'utf8')) as BenchmarkReport;renderBenchmarkReport(stored);
  const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTreeHash=sourceFingerprint();
  if(sourceTreeHash!==stored.metadata?.sourceTreeHash)throw new Error('REPLAY_SOURCE_TREE_CHANGED');
  const results=stored.mismatches.map(mismatch=>{
   const scenario=stored.cases.find(row=>row.scenario.id===mismatch.scenarioId)?.scenario;if(!scenario)throw new Error('MISSING_MISMATCH_FIXTURE');
   // New process, independently enumerate oracle and invoke real compiler again.
   const replayed=runBenchmark([scenario]);return {...mismatch,reproduced:replayed.mismatches.some(row=>row.scenarioId===mismatch.scenarioId&&row.method===mismatch.method&&row.reason===mismatch.reason)};
  });
  const failed=results.filter(row=>!row.reproduced).length;
  writeFileSync(join(folder,'replay.json'),JSON.stringify({schemaVersion:'dealtwin.benchmark-replay.v1',sourceSha,sourceTreeHash,replayed:results.length,failed,results},null,2));
  console.log(JSON.stringify({replayed:results.length,failed,artifact:relative(process.cwd(),join(folder,'replay.json'))}));
  if(failed)throw new Error('MISMATCH_REPLAY_FAILED');return;
 }
 const integer=(name:string,fallback:number)=>{const value=flags.get(name);if(value===undefined)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(value))throw new Error('INVALID_BENCHMARK_ARGUMENT');return Number(value);};
 const seed=integer('--seed',27),count=integer('--count',100);
 const corePath=join(fileURLToPath(new URL('.',import.meta.url)),'fixtures/core-scenarios.json');
 const core=parseScenarios(JSON.parse(readFileSync(corePath,'utf8')));const scenarios=parseScenarios([...core,...generateScenarios(seed,count)]);
 const metadata:RunMetadata={sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceTreeHash:sourceFingerprint(),dirty:execFileSync('git',['status','--porcelain=v1'],{encoding:'utf8'}).trim().length>0,seed,generatedAt:new Date().toISOString()};
 let serviceEvidence:ServiceEvidence|undefined;
 if(!noServices){
  const appUrl=process.env.DEALTWIN_BENCHMARK_APP_DATABASE_URL,resetUrl=process.env.DEALTWIN_BENCHMARK_RESET_DATABASE_URL;
  if(!appUrl||!resetUrl)throw new Error('BENCHMARK_DATABASE_CONFIGURATION_REQUIRED');
  for(const url of [appUrl,resetUrl])assertDisposableJudgeDatabaseUrl(url);
  const app=createPostgresPool(parsePostgresConfig({DATABASE_URL:appUrl,DATABASE_SSL_MODE:'disable'})),reset=createPostgresPool(parsePostgresConfig({DATABASE_URL:resetUrl,DATABASE_SSL_MODE:'disable'}));
  try{serviceEvidence=await measureDisposableServices(app,reset,metadata);}finally{await app.end();await reset.end();}
 }
 const report=runBenchmark(scenarios,{metadata,...(serviceEvidence?{serviceEvidence}:{})});const json=renderBenchmarkReport(report);
 // Immutable run directory: do not overwrite evidence from a prior successful run.
 mkdirSync(resolve(folder,'..'),{recursive:true});mkdirSync(folder);
 writeFileSync(join(folder,'report.json'),json,{flag:'wx'});
 writeFileSync(join(folder,'mismatch-fixtures.json'),JSON.stringify(report.mismatches.map(row=>({...row,scenario:scenarios.find(s=>s.id===row.scenarioId)})),null,2),{flag:'wx'});
 console.log(JSON.stringify({sourceSha:metadata.sourceSha,sourceTreeHash:metadata.sourceTreeHash,dirty:metadata.dirty,core:core.length,generated:count,total:scenarios.length,compiler:report.methods.compiler,fixedRule:report.methods.fixedRule,metrics:report.metrics,llmOnly:report.methods.llmOnly,mismatches:report.mismatches.length,artifact:relative(process.cwd(),join(folder,'report.json'))}));
 if(report.mismatches.some(row=>row.method==='compiler')||Object.entries(report.metrics).some(([key,value])=>key!=='extractionCorrectness'&&value.status==='MEASURED'&&value.numerator!==0))throw new Error('BENCHMARK_FOUND_FAILURES');
 if(report.metrics.extractionCorrectness?.status==='MEASURED'&&report.metrics.extractionCorrectness.numerator!==report.metrics.extractionCorrectness.denominator)throw new Error('BENCHMARK_FOUND_EXTRACTION_FAILURES');
}
