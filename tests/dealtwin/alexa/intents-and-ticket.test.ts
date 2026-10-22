import {describe,expect,it} from 'vitest';
import {parseIntent,parseDealRef,normalizeUtterance,suggestedUtterances} from '../../../lib/dealtwin/alexa/intents';
import {createAlexaTicket,verifyAlexaTicket} from '../../../lib/server/dealtwin/alexa-ticket';

describe('Alexa+ utterance grammar',()=>{
 it('maps every suggested judge utterance to a known intent',()=>{
  expect(suggestedUtterances.map(text=>parseIntent(text).kind)).toEqual(
   ['launch','compile','amend','proof','stress','reserve','commit','compile','supplier_increase','status','amend','replay']);
 });
 it('resolves deal references and spoken delays',()=>{
  expect(parseDealRef(normalizeUtterance('Check deal two'))).toBe('b');
  expect(parseDealRef(normalizeUtterance('the other deal'))).toBe('b');
  expect(parseDealRef(normalizeUtterance('Can I accept order 1?'))).toBe('a');
  expect(parseDealRef(normalizeUtterance('show me the proof'))).toBeNull();
  expect(parseIntent('What if the customer pays 7 days late?')).toEqual({kind:'stress',deal:null,days:7});
  expect(parseIntent('What if payment is delayed fourteen days for deal B')).toEqual({kind:'stress',deal:'b',days:14});
  // Out-of-range delays fall back to the scripted three days instead of an unbounded scenario.
  expect(parseIntent('what if they pay 99 days late')).toMatchObject({days:3});
 });
 it('treats yes/no as confirmation only and never guesses on noise',()=>{
  expect(parseIntent('Yes please').kind).toBe('confirm');
  expect(parseIntent('No, cancel that').kind).toBe('cancel');
  expect(parseIntent('Alexa, ')).toEqual({kind:'unknown'});
  expect(parseIntent('sing me a song').kind).toBe('unknown');
 });
});

const key='alexa-ticket-test-key-with-more-than-32-bytes';
const actor={tenantId:'dealtwin-judge-v1',actorId:'judge-browser-admin',role:'admin' as const};
const action={tool:'commit_deal' as const,input:{dealId:'judge-deal-a',expectedRevision:4}};
describe('Alexa pending-action ticket',()=>{
 const now=new Date('2026-10-22T08:00:00Z');
 it('round-trips only for the same actor, key and lifetime',()=>{
  const ticket=createAlexaTicket(actor,action,{key,now});
  expect(verifyAlexaTicket(actor,ticket,{key,now})).toEqual(action);
  expect(verifyAlexaTicket({...actor,actorId:'someone-else'},ticket,{key,now})).toBeNull();
  expect(verifyAlexaTicket({...actor,role:'sales'},ticket,{key,now})).toBeNull();
  expect(verifyAlexaTicket(actor,ticket,{key:key+'-rotated',now})).toBeNull();
  expect(verifyAlexaTicket(actor,ticket,{key,now:new Date(now.getTime()+300_000)})).toBeNull();
  expect(verifyAlexaTicket(actor,ticket,{key,now:new Date(now.getTime()-1000)})).toBeNull();
 });
 it('rejects tampered payloads and refuses long lifetimes or weak keys',()=>{
  const [payload,signature]=createAlexaTicket(actor,action,{key,now}).split('.');
  const tampered=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload!,'base64url').toString()),tool:'release_commitment'})).toString('base64url');
  expect(verifyAlexaTicket(actor,tampered+'.'+signature,{key,now})).toBeNull();
  expect(verifyAlexaTicket(actor,'not-a-ticket',{key,now})).toBeNull();
  expect(()=>createAlexaTicket(actor,action,{key,now,ttlSeconds:301})).toThrow('INVALID_TICKET_LIFETIME');
  expect(()=>createAlexaTicket(actor,action,{key:'short',now})).toThrow('ALEXA_TICKET_UNAVAILABLE');
 });
});
