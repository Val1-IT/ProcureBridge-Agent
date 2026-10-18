import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function POST(request:Request,context:{params:Promise<{commitmentId:string}>}):Promise<Response> {
 return handleWorkflowRequest(request,'replace',context.params);
}
