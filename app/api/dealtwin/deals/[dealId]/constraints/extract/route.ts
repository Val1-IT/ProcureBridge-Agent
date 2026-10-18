import {handleWorkflowRequest} from '../../../../../../../lib/server/dealtwin/workflow-route';
export async function POST(request:Request,context:{params:Promise<{dealId:string}>}){return handleWorkflowRequest(request,'extract',context.params);}
