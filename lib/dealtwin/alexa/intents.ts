/** Deterministic utterance grammar for the simulated Alexa+ surface.
 * It only chooses which MCP tool to plan. It never decides a financial outcome,
 * never sees a confirmation grant and cannot execute a mutation by itself. */
export type DealRef='a'|'b'|null;
export type AlexaIntent=
 |{kind:'launch'}|{kind:'help'}|{kind:'list'}|{kind:'timeline'}|{kind:'confirm'}|{kind:'cancel'}|{kind:'unknown'}
 |{kind:'status';deal:DealRef}|{kind:'compile';deal:DealRef}|{kind:'amend';deal:DealRef}|{kind:'proof';deal:DealRef}
 |{kind:'stress';deal:DealRef;days:number}|{kind:'reserve';deal:DealRef}|{kind:'commit';deal:DealRef}|{kind:'replay';deal:DealRef}
 |{kind:'supplier_increase'};
const numberWords:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fourteen:14,fifteen:15,thirty:30};
export function normalizeUtterance(value:string):string{
 return value.normalize('NFKC').toLowerCase().replace(/^\s*(hey\s+)?alexa[,!.]?\s*/,'').replace(/[^a-z0-9%.\s'-]/g,' ').replace(/\s+/g,' ').trim();
}
export function parseDealRef(text:string):DealRef{
 if(/\b(deal|order|quote|opportunity)\s*(b|two|2)\b|\b(second|other|competing) (deal|order)\b/.test(text))return 'b';
 if(/\b(deal|order|quote|opportunity)\s*(a|one|1)\b|\bfirst (deal|order)\b/.test(text))return 'a';
 return null;
}
function delayDays(text:string):number{
 const match=/\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|fourteen|fifteen|thirty)[- ]days?\b/.exec(text);
 if(!match)return 3;
 const value=numberWords[match[1]!]??Number(match[1]);
 return Number.isSafeInteger(value)&&value>=1&&value<=30?value:3;
}
export function parseIntent(raw:string):AlexaIntent{
 const text=normalizeUtterance(raw);const deal=parseDealRef(text);
 if(!text)return {kind:'unknown'};
 if(/^(yes|yeah|yep|confirm(ed)?|do it|go ahead|proceed|sure|ok(ay)?|approved?)\b/.test(text))return {kind:'confirm'};
 if(/^(no|nope|cancel|stop|never ?mind|don'?t|abort)\b/.test(text))return {kind:'cancel'};
 if(/\b(open|launch|start|connect)\b.*\b(deal ?twin)\b|^deal ?twin$/.test(text))return {kind:'launch'};
 if(/\bhelp\b|what can you do|how does this work/.test(text))return {kind:'help'};
 if(/\b(supplier|vendor|payable|ap|invoice|bill)\b.*\b(19|nineteen|increase[sd]?|went up|rose|raised|higher)\b|\b19 ?(million|m|juta)\b/.test(text))return {kind:'supplier_increase'};
 if(/\breplay|re-?run the proof|recompute|reproduce\b/.test(text))return {kind:'replay',deal};
 if(/\bstress|what if|\bdelay(ed|s)?\b|pays? late|late payment/.test(text))return {kind:'stress',deal,days:delayDays(text)};
 if(/\b(still valid|status|stale|still good|current|where (do|are) we)\b/.test(text))return {kind:'status',deal};
 if(/\b(fix|amend|amendment|make it work|recompile|remediat\w*|what would it take|counter ?offer|repair)\b/.test(text))return {kind:'amend',deal};
 if(/\b(commit|book it|book the|create the sales order|lock it in|finali[sz]e)\b/.test(text))return {kind:'commit',deal};
 if(/\b(reserve|hold|earmark)\b/.test(text))return {kind:'reserve',deal};
 if(/\b(proof|certif\w*|generate|evidence)\b/.test(text))return {kind:'proof',deal};
 if(/\b(compile|check|accept|afford|take (this|it|the)|feasib\w*|safe|can (i|we))\b/.test(text))return {kind:'compile',deal};
 if(/\b(cash|timeline|balance|runway|liquidity)\b/.test(text))return {kind:'timeline'};
 if(/\b(list|which deals|what deals|pipeline|my deals|show deals|deals)\b/.test(text))return {kind:'list'};
 return {kind:'unknown'};
}
/** The canonical judge script, in order. Shown as suggestion chips. */
export const suggestedUtterances=[
 'Alexa, open DealTwin',
 'Can I accept deal A?',
 'What would it take to make it work?',
 'Show me the proof',
 'What if the customer pays three days late?',
 'Reserve the cash for deal A',
 'Commit deal A',
 'Check deal B',
 'The supplier invoice went up to 19 million',
 'Is the deal A proof still valid?',
 'Fix deal A',
 'Replay the original proof',
] as const;
