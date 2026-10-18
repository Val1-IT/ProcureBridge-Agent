'use client';
import {useWorkspace} from './workspace-provider';
import {JudgeGuide} from './judge-guide';
import {WorkflowView} from './workflow-view';
export function JudgeWorkspace(){
 const {snapshot}=useWorkspace();
 return <>{snapshot?<JudgeGuide state={{...snapshot,compileRuns:snapshot.compileRuns??[]}}/>:null}<WorkflowView/></>;
}
