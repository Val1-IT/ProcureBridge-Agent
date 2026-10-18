import path from 'node:path';

// A final run can keep its artifacts together without overwriting prior evidence.
export function evidencePath(name:string,fallback:string):string {
  const root=process.env.DEALTWIN_TEST_EVIDENCE_ROOT;
  return root?path.resolve(root,name):path.resolve(fallback);
}
