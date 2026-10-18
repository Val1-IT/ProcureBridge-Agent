import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {ActorContext} from '../../dealtwin/application/operation-contracts';
import {assertJudgeActor} from '../../dealtwin/application/judge-seed-service';
import {sha256Canonical,type CanonicalJsonValue} from '../../dealtwin/domain/canonical-json';
import {parseToolRequest,isMutatingTool,type DealTwinToolRequest} from '../../dealtwin/mcp/tool-schemas';
const purpose='dealtwin.mcp-confirmation.v1';
const payloadSchema=z.strictObject({schemaVersion:z.literal(purpose),tenantId:z.literal('dealtwin-judge-v1'),
 actorId:z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),role:z.enum(['admin','procurement','warehouse','sales','finance','approver']),
 requestHash:z.string().regex(/^[0-9a-f]{64}$/),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative()});
function key(value:string){if(!value||Buffer.byteLength(value)<32)throw new Error('MCP_CONFIRMATION_UNAVAILABLE');return value;}
function hash(request:DealTwinToolRequest):string{
 if(!isMutatingTool(request.tool)||!('mode' in request.arguments)||request.arguments.mode!=='execute')throw new Error('EXECUTION_INTENT_REQUIRED');
 const {confirmationToken:_,...args}=request.arguments;void _;
 return sha256Canonical({tool:request.tool,arguments:args} as CanonicalJsonValue);
}
function signature(encoded:string,value:string){return createHmac('sha256',key(value)).update(purpose+'.'+encoded).digest();}
/** Trusted human-confirmation helper ONLY; never a public route or MCP tool. */
export function createMcpConfirmation(actor:ActorContext,value:unknown,options:{key:string;now:Date;ttlSeconds?:number}):string{
 assertJudgeActor(actor);const request=parseToolRequest(value);
 const ttl=options.ttlSeconds??300,issuedAt=Math.floor(options.now.getTime()/1000);
 if(!Number.isSafeInteger(issuedAt)||issuedAt<0||!Number.isSafeInteger(ttl)||ttl<1||ttl>300)throw new Error('INVALID_CONFIRMATION_LIFETIME');
 const data=payloadSchema.parse({schemaVersion:purpose,...actor,requestHash:hash(request),issuedAt,expiresAt:issuedAt+ttl});
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 return payload+'.'+signature(payload,options.key).toString('base64url');
}
export function verifyMcpConfirmation(actor:ActorContext,value:unknown,options:{key:string;now:Date}):boolean{
 try{
  assertJudgeActor(actor);const request=parseToolRequest(value),token='confirmationToken' in request.arguments?request.arguments.confirmationToken:undefined;
  if(typeof token!=='string'||token.length>2048)return false;
  const match=/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);if(!match)return false;
  const supplied=Buffer.from(match[2]!,'base64url'),expected=signature(match[1]!,options.key);
  if(supplied.length!==expected.length||supplied.toString('base64url')!==match[2]||!timingSafeEqual(supplied,expected))return false;
  const decoded=Buffer.from(match[1]!,'base64url');if(decoded.toString('base64url')!==match[1])return false;
  const data=payloadSchema.parse(JSON.parse(decoded.toString('utf8'))),now=Math.floor(options.now.getTime()/1000);
  return Number.isSafeInteger(now)&&data.issuedAt<=now&&data.expiresAt>now&&data.expiresAt>data.issuedAt&&data.expiresAt-data.issuedAt<=300
   &&data.tenantId===actor.tenantId&&data.actorId===actor.actorId&&data.role===actor.role&&data.requestHash===hash(request);
 }catch{return false;}
}
