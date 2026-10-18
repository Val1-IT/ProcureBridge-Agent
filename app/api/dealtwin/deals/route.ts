import { handleWorkflowRequest } from '@/lib/server/dealtwin/workflow-route';
export function GET(request:Request):Promise<Response> {
 return handleWorkflowRequest(request,'list');
}
export function POST(request:Request):Promise<Response> {
 return handleWorkflowRequest(request,'create');
}
