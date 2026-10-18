import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function GET(request:Request,context:{params:Promise<{dealId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'detail',context.params);
}
export function PATCH(request:Request,context:{params:Promise<{dealId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'edit',context.params);
}
