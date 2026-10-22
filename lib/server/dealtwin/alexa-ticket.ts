import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type {ActorContext} from '../../dealtwin/application/operation-contracts';
import {toolNames} from '../../dealtwin/mcp/tool-schemas';
const purpose='dealtwin.alexa-pending.v1';
const payloadSchema=z.strictObject({schemaVersion:z.literal(purpose),actorId:z.string().regex(/^[a-zA-Z0-9:_-]{1,128}$/),role:z.string().min(1).max(32),
 tool:z.enum(toolNames as [typeof toolNames[number],...typeof toolNames[number][]]),input:z.record(z.string(),z.unknown()),issuedAt:z.number().int().nonnegative(),expiresAt:z.number().int().nonnegative()});
export type AlexaPendingAction={tool:typeof toolNames[number];input:Record<string,unknown>};
function key(value:string){if(!value||Buffer.byteLength(value)<32)throw new Error('ALEXA_TICKET_UNAVAILABLE');return value;}
function signature(encoded:string,value:string){return createHmac('sha256',key(value)).update(purpose+'.'+encoded).digest();}
/** Binds one prepared (never executed) MCP mutation to the signed-in judge actor.
 * It is NOT an MCP confirmation grant: the server mints that grant only after a
 * human says yes, and the browser never receives it. */
export function createAlexaTicket(actor:ActorContext,action:AlexaPendingAction,options:{key:string;now:Date;ttlSeconds?:number}):string{
 const ttl=options.ttlSeconds??300,issuedAt=Math.floor(options.now.getTime()/1000);
 if(!Number.isSafeInteger(issuedAt)||!Number.isSafeInteger(ttl)||ttl<1||ttl>300)throw new Error('INVALID_TICKET_LIFETIME');
 const data=payloadSchema.parse({schemaVersion:purpose,actorId:actor.actorId,role:actor.role,tool:action.tool,input:action.input,issuedAt,expiresAt:issuedAt+ttl});
 const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
 return payload+'.'+signature(payload,options.key).toString('base64url');
}
export function verifyAlexaTicket(actor:ActorContext,ticket:unknown,options:{key:string;now:Date}):AlexaPendingAction|null{
 try{
  if(typeof ticket!=='string'||ticket.length>3072)return null;
  const match=/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(ticket);if(!match)return null;
  const supplied=Buffer.from(match[2]!,'base64url'),expected=signature(match[1]!,options.key);
  if(supplied.length!==expected.length||supplied.toString('base64url')!==match[2]||!timingSafeEqual(supplied,expected))return null;
  const data=payloadSchema.parse(JSON.parse(Buffer.from(match[1]!,'base64url').toString('utf8'))),now=Math.floor(options.now.getTime()/1000);
  if(data.actorId!==actor.actorId||data.role!==actor.role||data.issuedAt>now||data.expiresAt<=now||data.expiresAt-data.issuedAt>300)return null;
  return {tool:data.tool,input:data.input};
 }catch{return null;}
}
