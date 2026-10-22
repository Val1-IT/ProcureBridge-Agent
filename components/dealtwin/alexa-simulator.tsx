'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {suggestedUtterances} from '../../lib/dealtwin/alexa/intents';

// Mirrors the turn route's response; kept local so no server module reaches the client bundle.
interface Card {kind:string;title:string;subtitle?:string;tone:'good'|'bad'|'warn'|'info';facts:{label:string;value:string}[]}
interface Trace {method:string;tool?:string;mode?:'prepare'|'execute';httpStatus:number;code?:string}
interface Turn {ok:true;intent:string;speech:string;card:Card;pending:{ticket:string;tool:string;summary:string}|null;conversation:string;trace:Trace[]}
interface Line {who:'user'|'alexa';text:string}
interface Recognizer {lang:string;interimResults:boolean;maxAlternatives:number;start():void;abort():void;
 onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onend:(()=>void)|null;onerror:(()=>void)|null}
type RecognizerConstructor=new()=>Recognizer;

// The deal lifecycle the locked spec defines; the stepper shows where the voice conversation has taken each deal.
const stages=['Draft','Compile','Proof','Reserve','Commit','Stale','Recompile'] as const;
interface Lifecycle {focus:string;deals:Record<string,{stage:number;tone:Card['tone'];note:string}>}
function stageOf(card:Card):number|null{
 switch(card.kind){
  case 'connected':return 0;case 'compile':return 1;case 'amendment':case 'stress':return 2;
  case 'proof':return card.tone==='bad'?5:2;case 'reserve':return 3;case 'commit':return 4;
  case 'refusal':return card.facts.some(fact=>fact.value==='APPROVAL_REQUIRED')?4:null;case 'erp':return 5;case 'remediation':return 6;
  default:return null;
 }
}
function dealOf(text:string|undefined):string|null{const match=/\bdeal ([a-z])\b/i.exec(text??'');return match?'Deal '+match[1]!.toUpperCase():null;}
function advance(state:Lifecycle,card:Card,said:string):Lifecycle{
 const focus=dealOf(card.subtitle)??dealOf(said)??state.focus,stage=stageOf(card);
 if(stage===null)return {...state,focus};
 // An ERP change only invalidates deals that already hold a proof; deals still compiling are untouched.
 if(card.kind==='erp'){const deals={...state.deals};let first:string|null=null;
  for(const [name,row] of Object.entries(deals))if(row.stage>=2){deals[name]={stage:5,tone:'bad',note:'Proof relied on the old invoice'};first??=name;}
  return {focus:first??focus,deals};}
 const note=card.kind==='refusal'?'Waiting for a separate approver':card.title;
 return {focus,deals:{...state.deals,[focus]:{stage,tone:card.tone,note}}};
}
// Reads "Rp 5,000,000" style facts back into integers for the cash gauge; anything else is not a number.
function rupiahFact(card:Card,...labels:string[]):number|null{
 for(const label of labels){const value=card.facts.find(fact=>fact.label===label)?.value;if(value&&/\d/.test(value))return Number(value.replace(/[^0-9-]/g,''));}
 return null;
}
const rp=(value:number)=>'Rp '+value.toLocaleString('en-US');
// Show enum codes such as CONDITIONALLY_VALID as words so they wrap cleanly in titles and fact tiles.
const readable=(value:string)=>value.replace(/\b[A-Z]+(?:_[A-Z]+)+\b/g,code=>code.replaceAll('_',' '));

const idleCard:Card={kind:'idle',title:'Say “Alexa, open DealTwin”',subtitle:'Or tap a suggestion below',tone:'info',facts:[]};
const errorSpeech:Record<string,string>={UNAUTHENTICATED:'Your judge session is missing or expired. Open the launch link printed by npm run judge:demo again.',
 FORBIDDEN_ROLE:'This browser is signed in as the approver. Open the admin launch link to talk to DealTwin.',
 INVALID_ORIGIN:'That request came from another origin, so DealTwin refused it.'};

export function AlexaSimulator(){
 const [lines,setLines]=useState<Line[]>([]);const [card,setCard]=useState<Card>(idleCard);const [trace,setTrace]=useState<Trace[]>([]);
 const [pending,setPending]=useState<Turn['pending']>(null);const [busy,setBusy]=useState(false);const [listening,setListening]=useState(false);
 const [draft,setDraft]=useState('');const [life,setLife]=useState<Lifecycle>({focus:'Deal A',deals:{}});const [floor,setFloor]=useState<number|null>(null);
 const [fresh,setFresh]=useState(0);const [voice,setVoice]=useState(true);const [step,setStep]=useState(0);
 const conversation=useRef<string|undefined>(undefined);const recognizer=useRef<Recognizer|null>(null);const log=useRef<HTMLOListElement>(null);
 const [Recognition,setRecognition]=useState<RecognizerConstructor|null>(null);
 useEffect(()=>{const scope=window as unknown as {SpeechRecognition?:RecognizerConstructor;webkitSpeechRecognition?:RecognizerConstructor};
  setRecognition(()=>scope.SpeechRecognition??scope.webkitSpeechRecognition??null);},[]);
 useEffect(()=>{log.current?.lastElementChild?.scrollIntoView({block:'nearest'});},[lines]);
 useEffect(()=>()=>{recognizer.current?.abort();if('speechSynthesis' in window)window.speechSynthesis.cancel();},[]);

 const speak=useCallback((text:string)=>{
  if(!voice||!('speechSynthesis' in window))return;
  window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='en-US';utterance.rate=1.04;window.speechSynthesis.speak(utterance);
 },[voice]);
 const send=useCallback(async(body:{utterance?:string;action?:'confirm'|'cancel'},shown:string)=>{
  if(busy)return;setBusy(true);setLines(rows=>[...rows,{who:'user',text:shown}]);
  try{
   const response=await fetch('/api/dealtwin/alexa/turn',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},
    body:JSON.stringify({...body,...(conversation.current?{conversation:conversation.current}:{}),...(pending?{ticket:pending.ticket}:{})})});
   const data=await response.json() as Turn|{ok:false;error:{code:string}};
   if(!data.ok){const text=errorSpeech[data.error.code]??`DealTwin refused the request with ${data.error.code}.`;
    setLines(rows=>[...rows,{who:'alexa',text}]);setCard({kind:'error',title:data.error.code,subtitle:'HTTP '+response.status,tone:'bad',facts:[]});speak(text);return;}
   conversation.current=data.conversation;setPending(data.pending);setCard(data.card);setTrace(rows=>[...data.trace,...rows].slice(0,40));setFresh(data.trace.length);
   setLife(state=>advance(state,data.card,shown));const seenFloor=rupiahFact(data.card,'Cash floor');if(seenFloor!==null)setFloor(seenFloor);
   setLines(rows=>[...rows,{who:'alexa',text:data.speech}]);speak(data.speech);
   const index=suggestedUtterances.findIndex(text=>text.toLowerCase()===shown.toLowerCase());if(index>=0)setStep(index+1);
  }catch{const text='I could not reach the local DealTwin server.';setLines(rows=>[...rows,{who:'alexa',text}]);setCard({kind:'error',title:'Offline',tone:'bad',facts:[]});}
  finally{setBusy(false);}
 },[busy,pending,speak]);
 const say=(text:string)=>{const value=text.trim();if(value)void send({utterance:value},value);};
 const submit=(event:FormEvent)=>{event.preventDefault();say(draft);setDraft('');};
 const listen=()=>{
  if(!Recognition||busy)return;
  if(listening){recognizer.current?.abort();return;}
  window.speechSynthesis?.cancel();
  const next=new Recognition();next.lang='en-US';next.interimResults=false;next.maxAlternatives=1;recognizer.current=next;
  next.onresult=event=>{const heard=event.results[0]?.[0]?.transcript??'';if(heard)say(heard);};
  next.onend=()=>setListening(false);next.onerror=()=>setListening(false);
  setListening(true);next.start();
 };
 const nextSuggestion=pending?null:suggestedUtterances[step]??null;
 const shortfall=rupiahFact(card,'Shortfall');
 const lowest=rupiahFact(card,'Lowest projected balance','Lowest balance')??(shortfall!==null&&floor!==null?floor-shortfall:null);
 const focus=life.deals[life.focus];

 return <section className="dt-alexa" aria-labelledby="alexa-heading">
  <div className="dt-panel dt-alexa-intro">
   <p className="dt-kicker">DealTwin · a financial compiler for deals · voice front door</p>
   <h1 id="alexa-heading">Ask DealTwin before you say yes to a deal</h1>
   <ul className="dt-alexa-proofpoints" aria-label="Measured on the 113-case benchmark">
    <li><strong>0 / 67</strong><span>unsafe deals approved (rule of thumb: 34)</span></li>
    <li><strong>112 / 112</strong><span>proofs replay to the same hash</span></li>
    <li><strong>1 yes</strong><span>per write, with a single-use server grant</span></li>
   </ul>
   <p className="dt-boundary">Simulated Alexa+ experience. Every answer below comes from the real DealTwin MCP server (Streamable HTTP, protocol 2025-11-25) running against the synthetic ERP in PostgreSQL. Nothing is invented by the voice layer. It never approves its own deals, and every write waits for your “yes”.</p>
  </div>
  <div className="dt-panel dt-lifecycle" aria-label={life.focus+' lifecycle'}>
   <div className="dt-lifecycle-head"><h2>{life.focus} lifecycle</h2><span>{focus?.note??'Not compiled yet'}</span></div>
   <ol>{stages.map((name,index)=>{const state=!focus?'todo':index<focus.stage?'done':index===focus.stage?'now':'todo';
    return <li key={name} data-state={state} data-tone={state==='now'?focus!.tone:undefined} aria-current={state==='now'?'step':undefined}><span aria-hidden="true">{index+1}</span>{name}</li>;})}</ol>
  </div>
  <div className="dt-alexa-grid">
   <div className="dt-echo" data-state={listening?'listening':busy?'thinking':'idle'}>
    <div className="dt-echo-ring" aria-hidden="true"/>
    <div className={'dt-echo-card dt-tone-'+card.tone} aria-live="polite">
     <small>{card.kind==='idle'?'DealTwin skill':card.kind.replace(/_/g,' ')}</small>
     <h2>{readable(card.title)}</h2>{card.subtitle?<p>{card.subtitle}</p>:null}
     {lowest!==null&&floor!==null?<CashGauge lowest={lowest} floor={floor} smallest={card.kind==='amendment'}/>:null}
     {card.facts.length?<dl>{card.facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{readable(fact.value)}</dd></div>)}</dl>:null}
     {pending?<div className="dt-echo-confirm">
      <button className="dt-button" disabled={busy} onClick={()=>void send({action:'confirm'},'Yes')}>Yes, go ahead</button>
      <button className="dt-button dt-secondary" disabled={busy} onClick={()=>void send({action:'cancel'},'Cancel')}>Cancel</button>
     </div>:null}
    </div>
    <form className="dt-echo-input" onSubmit={submit}>
     <button type="button" className="dt-mic" onClick={listen} disabled={!Recognition||busy} aria-pressed={listening}
      title={Recognition?'Hold a conversation by voice':'Voice input needs a browser with the Web Speech API (Chrome or Edge)'}>
      <span aria-hidden="true">●</span><span className="dt-visually-hidden">{listening?'Stop listening':'Speak to Alexa'}</span></button>
     <label className="dt-visually-hidden" htmlFor="alexa-utterance">What do you want to ask?</label>
     <input id="alexa-utterance" value={draft} maxLength={300} onChange={event=>setDraft(event.target.value)} placeholder={nextSuggestion??'Ask DealTwin…'} autoComplete="off"/>
     <button className="dt-button" disabled={busy||!draft.trim()}>Send</button>
    </form>
    <label className="dt-echo-voice"><input type="checkbox" checked={voice} onChange={event=>{setVoice(event.target.checked);if(!event.target.checked)window.speechSynthesis?.cancel();}}/> Speak replies aloud</label>
   </div>
   <div className="dt-panel dt-alexa-log">
    <h2>Conversation</h2>
    {lines.length?<ol ref={log}>{lines.map((line,index)=><li key={index} data-who={line.who}><strong>{line.who==='user'?'You':'Alexa'}</strong><span>{line.text}</span></li>)}</ol>
     :<p className="dt-muted">Follow the judge script with the suggestions below, or ask in your own words.</p>}
   </div>
  </div>
  <div className="dt-panel">
   <h2>Judge script</h2>
   <ol className="dt-alexa-chips">{suggestedUtterances.map((text,index)=><li key={text}>
    <button className="dt-chip" disabled={busy} aria-current={text===nextSuggestion?'step':undefined} onClick={()=>say(text)}>{index+1}. {text}</button></li>)}</ol>
   <p className="dt-caption">Step 7 stops at the four-eyes rule on purpose. Open the approver launch link in a private window, approve the deal on Judge Mode, then say “Commit deal A” again.</p>
  </div>
  <details className="dt-panel dt-alexa-trace" open>
   <summary>MCP calls behind the voice ({trace.length})</summary>
   <p className="dt-caption">Newest first. “prepare” plans a write without touching data; “execute” runs only after your yes, with a single-use confirmation grant minted on the server.</p>
   {trace.length?<div className="dt-table-scroll"><table className="dt-table"><thead><tr><th>JSON-RPC method</th><th>Tool</th><th>Mode</th><th>HTTP</th><th>Result</th></tr></thead>
    <tbody>{trace.map((row,index)=><tr key={index} data-fresh={index<fresh||undefined}><td><code>{row.method}</code></td><td>{row.tool??'—'}</td><td>{row.mode??'—'}</td><td>{row.httpStatus}</td><td>{row.code??'ok'}</td></tr>)}</tbody></table></div>
    :<p className="dt-muted">No MCP calls yet.</p>}
  </details>
 </section>;
}

// Lowest projected balance against the cash floor: the one picture behind every verdict.
function CashGauge({lowest,floor,smallest}:{lowest:number;floor:number;smallest:boolean}){
 const max=Math.max(floor*2,lowest*1.25,1),width=Math.max(0,Math.min(100,lowest/max*100)),mark=floor/max*100,below=lowest<floor;
 return <figure className="dt-gauge" data-below={below||undefined}>
  <figcaption><span>Lowest projected balance</span><strong>{rp(lowest)}</strong></figcaption>
  <div className="dt-gauge-track" role="img" aria-label={`${rp(lowest)} against a cash floor of ${rp(floor)}`}>
   <div className="dt-gauge-fill" style={{width:width+'%'}}/><div className="dt-gauge-floor" style={{left:mark+'%'}}><span>floor {rp(floor)}</span></div>
  </div>
  <p>{below?`${rp(floor-lowest)} below the floor`:lowest===floor?(smallest?'Exactly at the floor — the smallest change that works':'Exactly at the floor, never below it'):`${rp(lowest-floor)} above the floor`}</p>
 </figure>;
}
