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

const idleCard:Card={kind:'idle',title:'Say “Alexa, open DealTwin”',subtitle:'Or tap a suggestion below',tone:'info',facts:[]};
const errorSpeech:Record<string,string>={UNAUTHENTICATED:'Your judge session is missing or expired. Open the launch link printed by npm run judge:demo again.',
 FORBIDDEN_ROLE:'This browser is signed in as the approver. Open the admin launch link to talk to DealTwin.',
 INVALID_ORIGIN:'That request came from another origin, so DealTwin refused it.'};

export function AlexaSimulator(){
 const [lines,setLines]=useState<Line[]>([]);const [card,setCard]=useState<Card>(idleCard);const [trace,setTrace]=useState<Trace[]>([]);
 const [pending,setPending]=useState<Turn['pending']>(null);const [busy,setBusy]=useState(false);const [listening,setListening]=useState(false);
 const [draft,setDraft]=useState('');const [voice,setVoice]=useState(true);const [step,setStep]=useState(0);
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
   conversation.current=data.conversation;setPending(data.pending);setCard(data.card);setTrace(rows=>[...data.trace,...rows].slice(0,40));
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

 return <section className="dt-alexa" aria-labelledby="alexa-heading">
  <div className="dt-panel dt-alexa-intro">
   <p className="dt-kicker">Alexa+ track · simulated device</p>
   <h1 id="alexa-heading">Ask DealTwin before you say yes to a deal</h1>
   <p className="dt-boundary">Simulated Alexa+ experience. Every answer below comes from the real DealTwin MCP server (Streamable HTTP, protocol 2025-11-25) running against the synthetic ERP in PostgreSQL. Nothing is invented by the voice layer. It never approves its own deals, and every write waits for your “yes”.</p>
  </div>
  <div className="dt-alexa-grid">
   <div className="dt-echo" data-state={listening?'listening':busy?'thinking':'idle'}>
    <div className="dt-echo-ring" aria-hidden="true"/>
    <div className={'dt-echo-card dt-tone-'+card.tone} aria-live="polite">
     <small>{card.kind==='idle'?'DealTwin skill':card.kind.replace(/_/g,' ')}</small>
     <h2>{card.title}</h2>{card.subtitle?<p>{card.subtitle}</p>:null}
     {card.facts.length?<dl>{card.facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>:null}
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
    <tbody>{trace.map((row,index)=><tr key={index}><td><code>{row.method}</code></td><td>{row.tool??'—'}</td><td>{row.mode??'—'}</td><td>{row.httpStatus}</td><td>{row.code??'ok'}</td></tr>)}</tbody></table></div>
    :<p className="dt-muted">No MCP calls yet.</p>}
  </details>
 </section>;
}
