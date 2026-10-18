import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function PATCH(request:Request,context:{params:Promise<{invoiceId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'obligation',context.params);
}
