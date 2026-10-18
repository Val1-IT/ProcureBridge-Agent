import { handleCommitmentRequest } from '@/lib/server/dealtwin/commitment-route';
export function POST(request: Request, context: { params: Promise<{ dealId: string }> }): Promise<Response> {
  return handleCommitmentRequest(request,context.params,'commit');
}
