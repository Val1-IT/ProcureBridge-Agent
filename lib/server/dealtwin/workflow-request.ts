import { parseBoundedJson } from './request-contract';
import {workflowSchemas,type WorkflowOperation} from '../../dealtwin/application/workflow-schemas';
export {workflowSchemas,type WorkflowOperation} from '../../dealtwin/application/workflow-schemas';
export async function parseWorkflowRequest(request:Request,operation:WorkflowOperation):Promise<Record<string,unknown>> {return parseBoundedJson(request,workflowSchemas[operation]);}
