import { compileDeal, type CompileInput, type CompileResult } from '../compiler/compile-deal';
import { encodeCompileInput, encodeCompileResult, type RecordedStressRun } from '../proof/build-proof';
import { applyStressTransform, encodeStressScenario, type StressScenario } from './stress-transform';
import { sha256Canonical } from '../domain/canonical-json';

import { NAMED_STRESS_ENGINE_VERSION } from '../proof/version';

export interface StressRun extends RecordedStressRun {
  readonly scenario: StressScenario;
  readonly engineVersion: typeof NAMED_STRESS_ENGINE_VERSION;
  readonly result: CompileResult;
  readonly inputHash: string;
  readonly resultHash: string;
}
export function runStressLab(input: CompileInput, scenarios: readonly StressScenario[], compiler: (input: CompileInput) => CompileResult = compileDeal): readonly StressRun[] {
  if (new Set(scenarios.map(item => item.id)).size !== scenarios.length) throw new Error('INVALID_STRESS_SCENARIO');
  return [...scenarios].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(scenario => {
    const transformed = applyStressTransform(input, scenario); const parameters = encodeStressScenario(scenario);
    const result = compiler(transformed); const encodedResult = encodeCompileResult(result);
    const inputHash = sha256Canonical({ engineVersion: NAMED_STRESS_ENGINE_VERSION, compileInput: encodeCompileInput(transformed), scenario: parameters });
    const resultHash = sha256Canonical(encodedResult);
    return { id: scenario.id, engineVersion: NAMED_STRESS_ENGINE_VERSION, scenario: structuredClone(scenario), result, inputHash, resultHash, transformType: 'dealtwin.named-stress.v1', parameters,
      inputPayload: { schemaVersion: 'dealtwin.stress-input.v1', engineVersion: NAMED_STRESS_ENGINE_VERSION, inputHash },
      resultPayload: { schemaVersion: 'dealtwin.stress-result.v1', engineVersion: NAMED_STRESS_ENGINE_VERSION, resultHash, result: encodedResult } };
  });
}
