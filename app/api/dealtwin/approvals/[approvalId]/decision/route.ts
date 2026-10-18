import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function POST(request:Request,context:{params:Promise<{approvalId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'approval',context.params);
}
