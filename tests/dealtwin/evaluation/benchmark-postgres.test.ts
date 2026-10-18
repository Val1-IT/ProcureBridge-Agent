import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {PostgresHarness} from '../postgres/harness';
import {measureDisposableServices} from '../../../evaluation/dealtwin/report';
import {generateScenarios} from '../../../evaluation/dealtwin/generate-scenarios';
import {runBenchmark} from '../../../evaluation/dealtwin/run-benchmark';
describe('actual application-role benchmark observations, no inferred metric pass',()=>{
 let db:PostgresHarness;
 beforeAll(async()=>{db=await PostgresHarness.connect();await db.resetAndMigrate();});
 afterAll(async()=>{await db?.close();});
 it('measures real commit/retry/stale/two-client race plus offline extraction contracts with honest denominators',async()=>{
  const metadata={sourceSha:'a'.repeat(40),sourceTreeHash:'b'.repeat(64),dirty:false,seed:27,generatedAt:'2026-10-13T12:00:00.000Z'};
  const evidence=await measureDisposableServices(db.appPool,db.resetPool,metadata,1);
  expect(evidence.observations.filter(row=>row.metric!=='extractionCorrectness')).toHaveLength(4);
  const report=runBenchmark(generateScenarios(27,2),{metadata,serviceEvidence:evidence});
  for(const metric of ['duplicateCommitment','missedStaleness','idempotency','raceBehavior'])expect(report.metrics[metric]).toMatchObject({status:'MEASURED',numerator:0,denominator:1,rate:0});
  expect(report.metrics.extractionCorrectness).toMatchObject({status:'MEASURED',numerator:4,denominator:4,rate:1});
  expect(report.methods.llmOnly).toEqual({status:'NOT_MEASURED',reason:'PROVIDER_EVIDENCE_MISSING'});
  expect(()=>runBenchmark(generateScenarios(27,2),{metadata,serviceEvidence:{...evidence,observations:evidence.observations.filter(row=>row.metric!=='missedStaleness')}})).toThrow();
 },180000);
});
