import {describe,expect,it} from 'vitest';
import {NemotronConstraintExtractor} from '../../../lib/dealtwin/ai/constraint-extractor';
import {extractionCases} from '../../../evaluation/dealtwin/nebius/extraction-cases';
import {oracleProvider,runExtractionEval} from '../../../evaluation/dealtwin/nebius/extraction-eval';
import {explanationCases,runExplanationEval,templateProvider} from '../../../evaluation/dealtwin/nebius/explanation-eval';
import {heldoutCases} from '../../../evaluation/dealtwin/nebius/heldout-cases';

describe('held-out extraction set',()=>{
 it('shares no text and no id with the tuning set',()=>{
  const texts=new Set(extractionCases.map(row=>row.text)),ids=new Set(extractionCases.map(row=>row.id));
  expect(heldoutCases.filter(row=>texts.has(row.text)||ids.has(row.id))).toEqual([]);
  expect(new Set(heldoutCases.map(row=>row.id)).size).toBe(heldoutCases.length);
 });
 it('runs end to end on the label oracle and records its case set',async()=>{
  const report=await runExtractionEval(new NemotronConstraintExtractor(oracleProvider(heldoutCases)),{mode:'offline-oracle',caseSet:'heldout',cases:heldoutCases});
  expect(report.caseSet).toBe('heldout');expect(report.summary).toMatchObject({cases:26,passed:26,clarifyCases:7,unsafeAccepts:0});
 });
});
describe('explanation eval',()=>{
 it('accepts every template answer and counts which failing verdicts name a cause',async()=>{
  const report=await runExplanationEval(templateProvider(),{mode:'offline-template'});
  expect(report.summary).toMatchObject({calls:explanationCases.length*2,accepted:20,fellBack:0,causeCases:14});
  expect(report.cases.every(row=>row.sentences.every(sentence=>!sentence.includes('{')))).toBe(true);
 });
});
