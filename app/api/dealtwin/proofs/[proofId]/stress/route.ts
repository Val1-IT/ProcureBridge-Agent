import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function POST(request:Request,context:{params:Promise<{proofId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'stress',context.params);
}
