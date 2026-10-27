import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {STACK,cardName,emptyData,validate,deleteSession,type Data} from "../src/core";

/** Run the real app against a small in-memory DOM, without touching browser data. */
interface HarnessStorage {local?:Map<string,string>;tab?:Map<string,string>;wallAt?:number;denyUi?:boolean}
function appHarness(seed?: Data, persisted: HarnessStorage = {}) {
  let elapsed=0, id=0, dialog: any=null;
  const wallAt=persisted.wallAt ?? 50*86400000;
  const listeners = new Map<string,Function[]>(),windowListeners = new Map<string,Function[]>();
  const stored = new Map<string,string>(persisted.local),tabStored = new Map<string,string>(persisted.tab);
  id=Math.max(0,...[...[...stored.values(),...tabStored.values()].join("").matchAll(/id-(\d+)/g)].map(m=>Number(m[1])));
  if (seed) stored.set("deckwise.v1",JSON.stringify(seed));
  let fullWrites=0,panelWrites=0;
  const root = () => {
    let html="", buttons:any[]=[],fields:any[]=[],gallery:any=null;
    const element:any = {
      get innerHTML(){return html;},
      set innerHTML(value:string){
        html=value; fullWrites++;
        const oldButtons=new Map(buttons.map(b=>[JSON.stringify(b.attrs),b]));
        buttons=Array.from(value.matchAll(/<button\b([^>]*)>/g),match=>{
          const attrs=Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),m=>[m[1],m[2]]));
          const dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith("data-")).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
          const old=oldButtons.get(JSON.stringify(attrs));
          return {attrs,dataset,disabled:/(?:^|\s)disabled(?:\s|$)/.test(match[1]),onclick:old?.onclick??null,focus(){},addEventListener(){}};
        });
        fields=Array.from(value.matchAll(/<(?:select|input|span|details)\b([^>]*)>/g),match=>{
          const id=match[1].match(/id="([^"]*)"/)?.[1];
          const events=new Map<string,Function>();
          const attrs=Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),m=>[m[1],m[2]]));
          const dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith("data-")).map(([k,v])=>[k.slice(5),v]));
          return {id,events,attrs,dataset,isConnected:true,open:/(?:^|\s)open(?:\s|$)/.test(match[1]),value:match[1].match(/value="([^"]*)"/)?.[1],textContent:"",addEventListener(name:string,fn:Function){events.set(name,fn);}};
        });
        const events=new Map<string,Function>();
        gallery={clientWidth:320,querySelector(){return {offsetWidth:html.includes("gallery-ribbon")?80:320};},scrollLeft:0,isConnected:true,addEventListener(name:string,fn:Function){events.set(name,fn);},scrollTo(opts:any){this.scrollLeft=opts.left;events.get("scroll")?.();}};
      },
      querySelectorAll(selector:string){
        const name=selector.match(/^\[([\w-]+)\]$/)?.[1];
        return name ? [...buttons,...fields].filter(b=>Object.hasOwn(b.attrs,name)) : [];
      },
      querySelector(selector:string){
        if(selector===".dialog-close")return {addEventListener(){}};
        if(selector===".gallery" && html.includes('class="gallery'))return gallery;
        if(selector.startsWith("#"))return fields.find(f=>f.id===selector.slice(1))??null;
        if(selector===".recall-controls" && html.includes('class="recall-controls"')) {
          const pattern=/(<section class="recall-controls"[^>]*>)([\s\S]*?)(<\/section>)/;
          const inside=()=>html.match(pattern)?.[2]??"";
          return {
            get innerHTML(){return inside();},
            set innerHTML(value:string){const oldWrites=fullWrites;element.innerHTML=html.replace(pattern,(_,before,_content,after)=>before+value+after);fullWrites=oldWrites;panelWrites++;},
            querySelectorAll(s:string){return element.querySelectorAll(s).filter((b:any)=>Object.entries(b.attrs).some(([k,v])=>k.startsWith("data-")&&inside().includes(k+'="'+v+'"')));},
            querySelector(s:string){return s.startsWith("[data-")?element.querySelector(s):null;}
          };
        }
        const match=selector.match(/^\[([\w-]+)="([^"]*)"\]$/);
        return match ? buttons.find(b=>b.attrs[match[1]]===match[2])??null : null;
      },
      addEventListener(){},remove(){dialog=null;},showModal(){this.open=true;},close(){dialog=null;},
      click(attr:string,value:string){
        const button=buttons.find(b=>b.attrs[attr]===value);
        assert.ok(button,"Missing "+attr+"="+value);
        if(button.disabled)return false;
        assert.equal(typeof button.onclick,"function");
        button.onclick({preventDefault(){}});
        return true;
      }
    };
    return element;
  };
  const app=root();
  const document:any={
    hidden:false,
    querySelector(selector:string){return selector==="#app"?app:selector==="dialog[open]"?dialog?.open?dialog:null:selector==="dialog"?dialog:app.querySelector(selector);},
    addEventListener(name:string,fn:Function){listeners.set(name,[...(listeners.get(name)??[]),fn]);},
    createElement(){return root();},
    body:{append(value:any){dialog=value;}}
  };
  const browserWindow={scrollY:0,addEventListener(name:string,fn:Function){windowListeners.set(name,[...(windowListeners.get(name)??[]),fn]);},scrollTo(_x:number,y:number){this.scrollY=y;}};
  const storage=(values:Map<string,string>)=>({getItem(key:string){if(persisted.denyUi&&key==="deckwise.ui.v1")throw Error("UI storage blocked");return values.get(key)??null;},setItem(key:string,value:string){if(persisted.denyUi&&key==="deckwise.ui.v1")throw Error("UI storage blocked");values.set(key,value);},removeItem:(key:string)=>values.delete(key)});
  const context=vm.createContext({
    document,window:browserWindow,navigator:{onLine:true},
    localStorage:storage(stored),sessionStorage:storage(tabStored),requestAnimationFrame:(fn:Function)=>fn(),matchMedia:()=>({matches:true}),
    performance:{now:()=>elapsed},Date:class extends Date {static now(){return wallAt+elapsed;}},
    crypto:{randomUUID:()=>"id-"+(++id)},Math:Object.assign(Object.create(Math),{random:()=>0.2}),
    CSS:{escape:(s:string)=>s},setInterval(){},ResizeObserver:class{observe(){}disconnect(){}},console
  });
  const cache=new Map<string,any>();
  const load=(file:string):any=>{
    if(file.endsWith(".css"))return {};
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{} as any};cache.set(file,module);
    let source=readFileSync(file,"utf8").replaceAll("import.meta.env.PROD","false");
    if(file.endsWith("main.ts"))source+="\nglobalThis.__app={get data(){return data},get q(){return q},get paused(){return paused},get view(){return view},get deckIndex(){return deckIndex},get active(){return active},get sessionElapsed(){return sessionElapsed}};";
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const execute=vm.runInContext("(function(exports,require,module){"+output+"\n})",context,{filename:file});
    execute(module.exports,(name:string)=>load(resolve(dirname(file),name+(name.endsWith(".css")?"":".ts"))),module);
    return module.exports;
  };
  load(resolve("src/main.ts"));
  const state=()=> (context as any).__app;
  const click=(attr:string,value:string)=>(dialog??app).click(attr,value);
  const begin=(mode="card-number",format="direct-recall")=>{
    click("data-view","practice");click("data-practice-type","position");click("data-practice-format",format);click("data-mode",mode);click("data-action","start");
  };
  const choose=(id:string,value:string)=>{if(id==="sequence-start")return click("data-sequence-start",value);if(id==="minutes"&&app.querySelector('[data-minutes="'+value+'"]'))return click("data-minutes",value);const field=app.querySelector("#"+id),event=id==="jump"?"input":"change";assert.ok(field?.events.get(event));field.events.get(event)({target:{value}});};
  const beginSequence=(direction="sequence-forward",format="direct-recall",random=false)=>{
    click("data-view","practice");click("data-practice-type","sequence");click("data-sequence-format",format);click("data-sequence-direction",direction);
    if(random)choose("sequence-start","random");click("data-action","start-sequence");
  };
  const cardAnswer=()=>{const [rank,suit]=STACK[state().q.position-1];click("data-rank",rank);click("data-suit",suit);};
  const key=(value:string)=>{
    let prevented=false;
    for(const fn of listeners.get("keydown")??[])fn({key:value,target:{tagName:"BODY"},preventDefault(){prevented=true;},ctrlKey:false,metaKey:false,altKey:false});
    return prevented;
  };
  return {app,begin,beginSequence,cardAnswer,click,key,state,choose,reveal:()=>{click("data-action","reveal");click("data-confirm-reveal",state().q.id);},toggle:(id:string,open:boolean)=>{const d=app.querySelector("#"+id);assert.ok(d?.events.get("toggle"));d.open=open;d.events.get("toggle")();},writes:()=>({full:fullWrites,panel:panelWrites}),advance:(ms:number)=>{elapsed+=ms;},document,
    visibility:(hidden:boolean)=>{document.hidden=hidden;for(const fn of listeners.get("visibilitychange")??[])fn();},
    reload:(delay=0)=>{for(const fn of windowListeners.get("pagehide")??[])fn();return appHarness(undefined,{local:stored,tab:tabStored,wallAt:wallAt+elapsed+delay,denyUi:persisted.denyUi});},
    reopen:()=>appHarness(undefined,{local:stored,wallAt:wallAt+elapsed}),scroll:(y:number)=>browserWindow.scrollY=y,scrollY:()=>browserWindow.scrollY,
    local:stored,tab:tabStored,dialogHtml:()=>dialog?.innerHTML??"",saved:()=>JSON.parse(stored.get("deckwise.v1")!)};
}

test("touch digits edit freely until Check answer, then record a first response",()=>{
 const ui=appHarness();ui.begin();
 const position=ui.state().q.position;
 for(const digit of String(position).padStart(2,"0"))ui.click("data-digit",digit);
 assert.equal(ui.state().data.attempts.length,0);
 assert.equal(ui.state().q.firstCorrect,null);
 ui.advance(1500);ui.click("data-action","recall-submit");
 const a=ui.saved().attempts[0];
 assert.equal(a.firstCorrect,true);assert.equal(a.elapsedMs,1500);assert.equal(a.answerFormat,"direct-recall");
 assert.equal(ui.state().q.input.digits,"");
 assert.equal((ui.app.innerHTML.match(/data-digit="/g)??[]).length,10);
});
test("rank/suit UI offers all cards and preserves the first miss after correction",()=>{
 const ui=appHarness();ui.begin("number-card");
 const stack="4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H TC 5D KD 2C 3H 8D 5C KS JD 8C TS KH JC 7S TH AD 4S 7H 4D AC 9C JS QD 7C QS TD 6C AH 9D".split(" ");
 const [rank,suit]=stack[ui.state().q.position-1];
 assert.equal((ui.app.innerHTML.match(/data-rank="/g)??[]).length,13);
 assert.equal((ui.app.innerHTML.match(/data-suit="/g)??[]).length,4);
 assert.equal(ui.app.innerHTML.includes('data-answer="'),false);
 const wrongRank=rank==="J"?"Q":"J";
 assert.equal(ui.app.innerHTML.includes('data-action="recall-submit"'),false);
 assert.equal(ui.click("data-suit",suit),false);
 ui.click("data-rank",wrongRank);ui.advance(700);ui.click("data-suit",suit);
 assert.equal(ui.saved().attempts[0].firstCorrect,false);
 assert.equal(ui.state().q.input.rank,"");assert.equal(ui.state().q.input.suit,"");
 const rejected=cardName(STACK.indexOf(wrongRank+suit)+1);
 assert.ok(ui.app.innerHTML.includes(`Incorrect: ${rejected}. Try again.`));
 assert.equal((ui.app.innerHTML.match(/aria-pressed="true"/g)??[]).length,0);
 assert.equal(ui.click("data-suit",suit),false);
 ui.click("data-rank",rank);
 assert.ok(ui.app.innerHTML.includes(`Incorrect: ${rejected}. Try again.`));
 assert.equal(ui.saved().attempts.length,1);assert.equal(ui.saved().attempts[0].finalResult,"unresolved");
 ui.advance(500);ui.click("data-suit",suit);
 const a=ui.saved().attempts[0];
 assert.equal(ui.saved().attempts.length,1);assert.equal(a.elapsedMs,700);assert.equal(a.wrong,1);
 assert.equal(a.finalResult,"corrected");assert.equal(a.finalElapsedMs,1200);
});
test("direct input, keyboard, pause, hints and reveal use the shared practice lifecycle",()=>{
 const ui=appHarness();ui.begin();
 ui.key("0");ui.key("7");assert.equal(ui.state().data.attempts.length,0);
 ui.click("data-action","pause");assert.equal(ui.state().paused,true);
 assert.equal(ui.click("data-digit","9"),false);assert.equal(ui.state().q.input.digits,"07");
 ui.advance(1000);ui.click("data-action","pause");
 ui.click("data-action","hint");ui.advance(500);ui.reveal();
 const a=ui.saved().attempts[0];assert.equal(a.interrupted,true);assert.equal(a.hint,true);assert.equal(a.revealed,true);
 assert.equal(a.answerFormat,"direct-recall");assert.equal(a.finalResult,"revealed");
 assert.ok(ui.app.innerHTML.includes("Answer revealed"));
});
test("multiple choice stays at five options and its keyboard shortcuts still grade",()=>{
 const ui=appHarness();ui.begin("card-number","multiple-choice");
 assert.equal((ui.app.innerHTML.match(/data-answer="/g)??[]).length,5);
 assert.equal(ui.app.innerHTML.includes('data-digit="'),false);
 const q=ui.state().q;ui.advance(1000);ui.key(String(q.options.indexOf(q.position)+1));
 assert.equal(ui.saved().attempts[0].firstCorrect,true);assert.equal(ui.saved().attempts[0].answerFormat,"multiple-choice");
});
test("session results and Progress use the chosen answer format without hiding old results",()=>{
 const ui=appHarness();ui.begin();
 for(const digit of String(ui.state().q.position))ui.click("data-digit",digit);
 ui.click("data-action","recall-submit");ui.click("data-action","finish");ui.click("data-action","summary-progress");
 assert.ok(ui.app.innerHTML.includes('data-report-format="direct-recall" aria-pressed="true"'));
 assert.ok(ui.app.innerHTML.includes("<strong>1</strong><span>Questions answered"));
 ui.click("data-report-format","multiple-choice");
 assert.ok(ui.app.innerHTML.includes("No results in this view"));
 ui.click("data-report-format","all");
 assert.ok(ui.app.innerHTML.includes("<strong>1</strong><span>Questions answered"));
 assert.equal(ui.saved().attempts.length,1);
 ui.click("data-report-format","multiple-choice");ui.click("data-practice-direction","card-number");
 assert.equal(ui.state().data.settings.answerFormat,"multiple-choice");
});


test("sequence setup remembers its own input format without changing position practice",()=>{
 const ui=appHarness();ui.click("data-practice-type","sequence");
 ui.click("data-sequence-format","direct-recall");
 assert.equal(ui.saved().settings.sequenceAnswerFormat,"direct-recall");
 assert.equal(ui.saved().settings.answerFormat,"multiple-choice");
 ui.begin("number-card","multiple-choice");ui.click("data-action","finish");ui.click("data-action","summary-progress");
 ui.click("data-view","practice");ui.click("data-practice-type","sequence");
 assert.ok(ui.app.innerHTML.includes('data-sequence-format="direct-recall" aria-pressed="true"'));
 ui.click("data-action","start-sequence");
 assert.equal(ui.state().q.answerFormat,"direct-recall");
 assert.equal(ui.state().q.position,1);
 assert.ok(ui.app.innerHTML.includes('aria-label="Position 1"'));
 assert.equal((ui.app.innerHTML.match(/data-rank="/g)??[]).length,13);
});
test("rank edits update only the answer panel and preserve prompt and session controls",()=>{
 const ui=appHarness();ui.beginSequence();
 const before=ui.writes(),frame=ui.app.innerHTML.split('<section class="recall-controls"')[0];
 ui.click("data-rank","Q");ui.click("data-rank","J");
 assert.equal(ui.writes().full,before.full);assert.equal(ui.writes().panel,before.panel+2);
 assert.equal(ui.app.innerHTML.split('<section class="recall-controls"')[0],frame);
 ui.click("data-action","pause");assert.equal(ui.state().paused,true);
 ui.click("data-action","pause");assert.equal(ui.state().paused,false);
 assert.equal(ui.state().q.input.rank,"J");
});
test("direct forward sequence covers all 52 cards and finishes a full run",()=>{
 const ui=appHarness();ui.beginSequence();
 for(let i=0;i<52;i++){assert.equal(ui.state().q.position,i+1);ui.advance(100);ui.cardAnswer();}
 const d=ui.saved(),s=d.sessions[0];assert.equal(s.completed,true);assert.equal(s.elapsedMs,5200);
 assert.equal(s.answerFormat,"direct-recall");assert.equal(d.attempts.length,52);assert.equal(new Set(d.attempts.map((a:any)=>a.position)).size,52);
 assert.ok(d.attempts.every((a:any)=>a.direction==="sequence-forward"&&a.answerFormat==="direct-recall"&&a.firstCorrect));
 assert.ok(ui.state().q===null);
 assert.deepEqual(validate(d),d);
 ui.click("data-action","summary-progress");
 assert.ok(ui.app.innerHTML.includes('data-report-format="direct-recall" aria-pressed="true"'));
 assert.ok(ui.app.innerHTML.includes("Forward · Direct recall"));
 ui.click("data-report-format","multiple-choice");assert.ok(ui.app.innerHTML.includes("No results in this view"));
 ui.click("data-report-format","all");assert.ok(ui.app.innerHTML.includes("Forward · Multiple choice"));assert.ok(ui.app.innerHTML.includes("Forward · Direct recall"));
});
test("direct backward random-start sequence wraps and checks each card once",()=>{
 const ui=appHarness();ui.beginSequence("sequence-backward","direct-recall",true);
 const start=ui.state().q.position;assert.equal(start,11);assert.ok(ui.app.innerHTML.includes('aria-label="Position 11"'));
 for(let i=0;i<52;i++){assert.equal(ui.state().q.position,((start-1-i+52)%52)+1);ui.advance(100);ui.cardAnswer();}
 const d=ui.saved();assert.equal(d.sessions[0].completed,true);assert.equal(d.sessions[0].startPosition,11);
 assert.equal(new Set(d.attempts.map((a:any)=>a.position)).size,52);assert.deepEqual(validate(d),d);
});
test("sequence miss correction, reveal, pause and early finish preserve penalties and raw time",()=>{
 const ui=appHarness();ui.beginSequence();
 ui.click("data-rank","J");ui.advance(500);ui.click("data-suit","D");
 ui.advance(300);ui.cardAnswer();assert.equal(ui.saved().attempts[0].firstCorrect,false);assert.equal(ui.saved().attempts[0].elapsedMs,500);
 ui.click("data-action","pause");ui.advance(4000);ui.click("data-action","pause");ui.advance(200);ui.reveal();
 ui.click("data-action","finish");
 const d=ui.saved();assert.equal(d.sessions[0].elapsedMs,1000);assert.equal(d.sessions[0].completed,false);
 assert.equal(d.attempts[0].finalResult,"corrected");assert.equal(d.attempts[1].finalResult,"revealed");assert.equal(d.attempts[1].interrupted,true);
 assert.ok(ui.dialogHtml().includes("2/52 answered"));assert.ok(ui.dialogHtml().includes("+10s"));assert.ok(ui.dialogHtml().includes("0:11.0"));
 assert.deepEqual(validate(d),d);
});
test("sequence multiple choice retains its original keyboard input and empty-state navigation",()=>{
 const ui=appHarness();ui.beginSequence("sequence-backward","multiple-choice");
 const q=ui.state().q;assert.equal(q.position,52);assert.equal(q.options.length,5);
 assert.equal(ui.app.innerHTML.includes('data-rank="'),false);
 ui.key(String(q.options.indexOf(q.position)+1));assert.equal(ui.state().q.position,51);
 ui.click("data-action","finish");ui.click("data-action","summary-progress");
 ui.click("data-report-format","direct-recall");assert.ok(ui.app.innerHTML.includes("No results in this view"));
 ui.click("data-action","sequence-setup");assert.ok(ui.app.innerHTML.includes('data-sequence-format="'));
});
test("legacy sequence history remains visible as multiple choice after reload",()=>{
 const d=emptyData();delete d.settings.sequenceAnswerFormat;delete d.settings.answerFormat;
 const session={id:"legacy",startedAt:50*86400000-1000,endedAt:50*86400000,mode:"sequence-forward" as const,duration:0,runTarget:52,startPosition:1,elapsedMs:52000,completed:true};
 d.sessions=[session];d.attempts=STACK.map((_,i)=>({id:"a"+i,sessionId:"legacy",position:i+1,direction:"sequence-forward",at:session.startedAt+i,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false}));
 const ui=appHarness(d);ui.click("data-view","progress");ui.click("data-stats-type","sequence");
 assert.ok(ui.app.innerHTML.includes("Forward · Multiple choice"));assert.ok(ui.app.innerHTML.includes("1 completed"));
 ui.click("data-report-format","direct-recall");assert.ok(ui.app.innerHTML.includes("No results in this view"));
});

test("wrong digit answers clear for keyboard retry and preserve the exact rejected input",()=>{
 const ui=appHarness();ui.begin();
 const position=ui.state().q.position,miss=position===7?8:7;
 const rejected=String(miss).padStart(2,"0");
 for(const digit of rejected)ui.key(digit);
 ui.advance(800);ui.key("Enter");
 assert.equal(ui.state().q.input.digits,"");
 assert.ok(ui.app.innerHTML.includes("Incorrect: "+rejected+". Try again."));
 assert.equal(ui.click("data-action","recall-submit"),false);
 const digits=String(position);
 ui.key(digits[0]);
 assert.ok(ui.app.innerHTML.includes("Incorrect: "+rejected+". Try again."));
 for(const digit of digits.slice(1))ui.key(digit);
 ui.advance(600);ui.key("Enter");
 const a=ui.saved().attempts[0];
 assert.equal(a.firstCorrect,false);assert.equal(a.wrong,1);assert.equal(a.elapsedMs,800);
 assert.equal(a.finalResult,"corrected");assert.equal(a.finalElapsedMs,1400);
 assert.equal(ui.saved().attempts.length,1);
 assert.equal(ui.app.innerHTML.includes("Incorrect:"),false);
});

for(const direction of ["sequence-forward","sequence-backward"]) {
 test(direction+" clears each wrong card answer while keeping feedback and penalties",()=>{
  const ui=appHarness();ui.beginSequence(direction);
  for(const [rank,suit,name] of [["J","D","Jack of Diamonds"],["K","S","King of Spades"]]) {
   ui.click("data-rank",rank);ui.advance(250);ui.click("data-suit",suit);
   assert.equal(ui.state().q.input.rank,"");assert.equal(ui.state().q.input.suit,"");
   assert.ok(ui.app.innerHTML.includes("Incorrect: "+name+". Try again."));
   assert.ok(ui.app.innerHTML.includes("<strong>Rank + suit</strong>"));
   assert.equal(ui.click("data-suit",suit),false);
   assert.equal(ui.app.innerHTML.includes('data-action="recall-submit"'),false);
  }
  assert.equal(ui.saved().attempts[0].wrong,2);
  assert.equal(ui.saved().attempts[0].elapsedMs,250);
  ui.advance(300);ui.cardAnswer();
  const a=ui.saved().attempts[0];
  assert.equal(a.firstCorrect,false);assert.equal(a.finalResult,"corrected");
  assert.equal(a.finalElapsedMs,800);assert.equal(a.wrong,2);
  assert.equal(ui.app.innerHTML.includes("Incorrect:"),false);
  ui.click("data-action","finish");
  assert.ok(ui.dialogHtml().includes("+10s"));
  assert.deepEqual(validate(ui.saved()),ui.saved());
 });
}

test("card keyboard input submits immediately on suit and ignores suit-only keys",()=>{
 const ui=appHarness();ui.beginSequence();
 assert.equal(ui.app.innerHTML.includes('data-action="recall-submit"'),false);
 ui.key("C");assert.equal(ui.state().q.input.suit,"");assert.equal(ui.saved().attempts.length,0);
 ui.key("J");ui.key("4");assert.equal(ui.state().q.input.rank,"4");assert.equal(ui.saved().attempts.length,0);
 ui.advance(1250);ui.key("c");
 assert.equal(ui.saved().attempts.length,1);assert.equal(ui.saved().attempts[0].firstCorrect,true);
 assert.equal(ui.saved().attempts[0].elapsedMs,1250);assert.equal(ui.saved().attempts[0].finalResult,"correct");
 assert.equal(ui.state().q.position,2);
 ui.key("c");assert.equal(ui.saved().attempts.length,1);assert.equal(ui.state().q.input.suit,"");
});

test("previous wrong card combinations cannot submit again through touch or keyboard",()=>{
 const ui=appHarness();ui.beginSequence();
 ui.click("data-rank","J");ui.advance(100);ui.click("data-suit","D");
 ui.click("data-rank","J");
 assert.equal(ui.click("data-suit","D"),false);ui.key("D");
 assert.equal(ui.saved().attempts.length,1);assert.equal(ui.saved().attempts[0].wrong,1);
 assert.equal(ui.state().q.input.rank,"J");assert.equal(ui.state().q.input.suit,"");
 assert.ok(ui.app.innerHTML.includes("Incorrect: Jack of Diamonds. Try again."));
 ui.advance(200);ui.cardAnswer();
 assert.equal(ui.saved().attempts[0].wrong,1);assert.equal(ui.saved().attempts[0].elapsedMs,100);
 assert.equal(ui.saved().attempts[0].finalElapsedMs,300);assert.equal(ui.saved().attempts[0].finalResult,"corrected");
});

test("suit submission respects pause, hint and reveal lifecycle",()=>{
 const ui=appHarness();ui.begin("number-card");
 const [rank,suit]=STACK[ui.state().q.position-1];
 ui.click("data-rank",rank);ui.click("data-action","pause");
 assert.equal(ui.click("data-suit",suit),false);ui.key(suit);assert.equal(ui.saved().attempts.length,0);
 ui.advance(1000);ui.click("data-action","pause");ui.click("data-action","hint");
 ui.advance(600);ui.key(suit);
 const a=ui.saved().attempts[0];assert.equal(a.firstCorrect,true);assert.equal(a.elapsedMs,600);
 assert.equal(a.hint,true);assert.equal(a.interrupted,true);
 ui.click("data-rank","K");ui.reveal();
 const count=ui.saved().attempts.length;
 assert.equal(ui.click("data-suit","S"),false);ui.key("S");assert.equal(ui.saved().attempts.length,count);
 assert.equal(ui.saved().attempts.at(-1).finalResult,"revealed");
});

test("Enter preserves native activation for card buttons and still confirms number answers",()=>{
 const cards=appHarness();cards.beginSequence();
 cards.click("data-rank","4");assert.equal(cards.key("Enter"),false);
 assert.equal(cards.saved().attempts.length,0);
 // A focused suit's native Enter activation reaches the same click handler.
 cards.click("data-suit","C");assert.equal(cards.saved().attempts[0].firstCorrect,true);
 const numbers=appHarness();numbers.begin();
 for(const digit of String(numbers.state().q.position))numbers.key(digit);
 assert.equal(numbers.key("Enter"),true);assert.equal(numbers.saved().attempts[0].firstCorrect,true);
});

test("sequence context follows answered cards without revealing the target on misses or reveal",()=>{
 for(const direction of ["sequence-forward","sequence-backward"]) {
  const ui=appHarness();ui.beginSequence(direction);
  const positions=()=>Array.from(String(ui.app.innerHTML).matchAll(/data-context-position="(\d+)"/g),m=>Number(m[1]));
  const start=ui.state().q.position;
  assert.deepEqual(positions(),[]);
  assert.ok(ui.app.innerHTML.includes('aria-label="Position '+start+'"'));
  ui.cardAnswer();assert.deepEqual(positions(),[start]);
  const second=ui.state().q.position;ui.cardAnswer();
  assert.deepEqual(positions(),[start,second]);
  const target=ui.state().q.position;
  ui.click("data-rank","J");ui.click("data-suit","D");
  assert.equal(ui.state().q.position,target);assert.deepEqual(positions(),[start,second]);
  ui.reveal();assert.deepEqual(positions(),[start,second]);
  assert.equal(ui.app.innerHTML.includes('data-context-position="'+target+'"'),false);
  ui.click("data-action","next");assert.deepEqual(positions(),[second,target]);
  ui.click("data-action","pause");assert.deepEqual(positions(),[second,target]);
 }
});
test("random backward context wraps in run order and starts without clues",()=>{
 const ui=appHarness();ui.beginSequence("sequence-backward","multiple-choice",true);
 const positions=()=>Array.from(String(ui.app.innerHTML).matchAll(/data-context-position="(\d+)"/g),m=>Number(m[1]));
 assert.deepEqual(positions(),[]);
 while(ui.state().q.position!==1)ui.click("data-answer",String(ui.state().q.position));
 ui.click("data-answer","1");assert.equal(ui.state().q.position,52);assert.deepEqual(positions(),[2,1]);
 ui.click("data-answer","52");assert.equal(ui.state().q.position,51);assert.deepEqual(positions(),[1,52]);
});

test("Progress has four unlabelled accessible selector rows and preserves each quiz's filters",()=>{
 const ui=appHarness();ui.click("data-view","progress");ui.click("data-stats-type","sequence");
 const panel=ui.app.innerHTML.split('<section class="progress-controls"')[1].split("</section>")[0];
 assert.equal(panel.includes("<select"),false);
 for(const label of ["Quiz type","Sequence direction","Answer format","Statistics period"])assert.ok(panel.includes('aria-label="'+label+'"'));
 for(const label of ["<span>Quiz type</span>","<span>Answer format</span>","<span>Recent results</span>"])assert.equal(panel.includes(label),false);
 ui.click("data-stats-direction","sequence-backward");ui.click("data-report-format","multiple-choice");
 ui.click("data-stats-type","position");ui.click("data-stats-direction","card-number");ui.click("data-report-format","all");
 ui.choose("card-sort","misses");ui.click("data-stats-period","30");
 ui.click("data-stats-type","sequence");assert.ok(ui.app.innerHTML.includes('data-stats-direction="sequence-backward" aria-pressed="true"'));
 assert.ok(ui.app.innerHTML.includes('data-report-format="multiple-choice" aria-pressed="true"'));
 ui.click("data-stats-type","position");assert.ok(ui.app.innerHTML.includes('data-stats-direction="card-number" aria-pressed="true"'));
 assert.ok(ui.app.innerHTML.includes('data-report-format="all" aria-pressed="true"'));
});

test("reload and reopening restore Progress filters, sorting, scroll and answer history",()=>{
 const ui=appHarness();ui.begin();ui.advance(800);
 for(const digit of String(ui.state().q.position))ui.key(digit);
 ui.key("Enter");ui.click("data-action","finish");ui.click("data-action","summary-progress");
 ui.click("data-stats-direction","number-card");ui.click("data-report-format","all");
 ui.click("data-stats-period","30");ui.choose("card-sort","mastery");ui.scroll(480);
 const history=ui.saved();const reloaded=ui.reload();
 assert.equal(reloaded.state().view,"progress");assert.equal(reloaded.scrollY(),480);
 assert.ok(reloaded.app.innerHTML.includes('data-stats-type="position" aria-pressed="true"'));
 assert.ok(reloaded.app.innerHTML.includes('data-stats-direction="number-card" aria-pressed="true"'));
 assert.ok(reloaded.app.innerHTML.includes('data-report-format="all" aria-pressed="true"'));
 assert.ok(reloaded.app.innerHTML.includes('data-stats-period="30" aria-pressed="true"'));
 assert.ok(reloaded.app.innerHTML.includes('value="mastery" selected'));
 assert.deepEqual(reloaded.saved(),history);
 reloaded.click("data-view","settings");reloaded.click("data-view","progress");
 assert.ok(reloaded.app.innerHTML.includes('data-stats-direction="number-card" aria-pressed="true"'));
 const reopened=reloaded.reopen();assert.equal(reopened.state().view,"progress");
 assert.ok(reopened.app.innerHTML.includes('data-report-format="all" aria-pressed="true"'));
});

test("Deck Browse restores the selected card and sequence setup keeps its selections",()=>{
 const ui=appHarness();ui.click("data-view","deck");ui.click("data-deck-mode","browse");
 for(let i=0;i<16;i++)ui.click("data-action","following");
 let next=ui.reload();assert.equal(next.state().view,"deck");assert.equal(next.state().deckIndex,16);
 assert.ok(next.app.innerHTML.includes('data-deck-mode="browse" aria-pressed="true"'));
 assert.ok(next.app.innerHTML.includes('id="jump" type="range" min="1" max="52" value="17"'));
 next.click("data-view","practice");next.click("data-practice-type","sequence");next.click("data-sequence-direction","sequence-backward");
 next.click("data-sequence-format","direct-recall");next.choose("sequence-start","random");
 next=next.reload();assert.ok(next.app.innerHTML.includes('data-sequence-direction="sequence-backward" aria-pressed="true"'));
 assert.ok(next.app.innerHTML.includes('data-sequence-format="direct-recall" aria-pressed="true"'));
 assert.ok(next.app.innerHTML.includes('data-sequence-start="random" aria-pressed="true"'));
 next.click("data-view","practice");next.click("data-practice-type","position");next.click("data-mode","mixed");next.click("data-practice-format","direct-recall");next.choose("minutes","10");
 next=next.reload();assert.equal(next.state().view,"practice");
 assert.ok(next.app.innerHTML.includes('data-mode="mixed" aria-pressed="true"'));
 assert.ok(next.app.innerHTML.includes('data-practice-format="direct-recall" aria-pressed="true"'));
 assert.ok(next.app.innerHTML.includes("Start 10-minute session"));
 next.click("data-view","settings");next=next.reload();assert.equal(next.state().view,"settings");
 assert.ok(next.app.innerHTML.includes('data-action="install"'));
});

test("reload resumes an unfinished digit answer paused and excludes closed time",()=>{
 const ui=appHarness();ui.begin();
 const id=ui.state().q.id,position=ui.state().q.position,digits=String(position).padStart(2,"0");
 ui.key(digits[0]);ui.advance(700);
 const next=ui.reload(60000);
 assert.equal(next.state().view,"practice");assert.equal(next.state().paused,true);
 assert.equal(next.state().q.id,id);assert.equal(next.state().q.input.digits,digits[0]);
 assert.equal(next.state().q.interrupted,true);assert.equal(next.state().sessionElapsed,700);
 next.advance(5000);next.click("data-action","pause");
 for(const digit of digits.slice(1))next.key(digit);
 next.advance(300);next.key("Enter");
 const a=next.saved().attempts[0];assert.equal(a.id,id);assert.equal(a.elapsedMs,1000);
 assert.equal(a.firstCorrect,true);assert.equal(a.interrupted,true);
 assert.equal(next.saved().sessions.length,1);assert.deepEqual(validate(next.saved()),next.saved());
});

for(const direction of ["sequence-forward","sequence-backward"])test(direction+" resumes misses, partial input, context and the remaining deck",()=>{
 let ui=appHarness();ui.beginSequence(direction);ui.advance(100);ui.cardAnswer();ui.advance(200);ui.cardAnswer();
 const position=ui.state().q.position;
 ui.click("data-rank","J");ui.advance(300);ui.click("data-suit","D");
 const [rank,suit]=STACK[position-1];ui.click("data-rank",rank);ui.advance(100);
 const previous=ui.saved().attempts.map((a:any)=>a.id),id=ui.state().q.id;
 ui=ui.reload(3600000);assert.equal(ui.state().view,"practice");assert.equal(ui.state().paused,true);
 assert.equal(ui.state().q.id,id);assert.equal(ui.state().q.position,position);assert.equal(ui.state().q.input.rank,rank);
 assert.equal(ui.state().q.lastIncorrect,"Jack of Diamonds");
 assert.equal((ui.app.innerHTML.match(/data-context-position="/g)??[]).length,2);
 ui.click("data-action","pause");assert.ok(ui.app.innerHTML.includes("Incorrect: Jack of Diamonds. Try again."));
 ui.advance(100);ui.click("data-suit",suit);
 assert.equal(ui.saved().attempts[2].firstCorrect,false);assert.equal(ui.saved().attempts[2].wrong,1);
 assert.equal(ui.saved().attempts[2].elapsedMs,300);assert.equal(ui.saved().attempts[2].finalElapsedMs,500);
 for(let i=3;i<52;i++){ui.advance(100);ui.cardAnswer();}
 const d=ui.saved();assert.equal(d.attempts.length,52);assert.equal(new Set(d.attempts.map((a:any)=>a.position)).size,52);
 assert.equal(d.sessions.length,1);assert.equal(d.sessions[0].completed,true);assert.equal(d.sessions[0].elapsedMs,5700);
 assert.deepEqual(d.attempts.slice(0,3).map((a:any)=>a.id),previous);assert.ok(ui.dialogHtml().includes("+5s"));
 assert.deepEqual(validate(d),d);
 const finished=ui.reload();assert.equal(finished.state().active,null);
});

test("multiple-choice options and revealed questions survive reload without extra answers",()=>{
 let ui=appHarness();ui.beginSequence("sequence-backward","multiple-choice",true);
 const id=ui.state().q.id,options=JSON.parse(JSON.stringify(ui.state().q.options));
 ui=ui.reload();assert.equal(ui.state().q.id,id);assert.deepEqual(JSON.parse(JSON.stringify(ui.state().q.options)),options);
 ui.click("data-action","pause");ui.advance(200);ui.reveal();
 ui=ui.reload();assert.equal(ui.state().q.done,true);assert.equal(ui.saved().attempts.length,1);
 ui.click("data-action","pause");ui.click("data-action","next");
 assert.equal(ui.saved().attempts.length,1);assert.notEqual(ui.state().q.id,id);
});

test("blocked UI storage leaves training and raw progress usable",()=>{
 const ui=appHarness(undefined,{denyUi:true});ui.begin();ui.advance(200);
 for(const digit of String(ui.state().q.position))ui.key(digit);
 ui.key("Enter");assert.equal(ui.saved().attempts[0].firstCorrect,true);
 assert.equal(ui.app.innerHTML.includes("could not be saved"),false);
});

test("a new tab restores preferences without taking over another tab's active quiz",()=>{
 const ui=appHarness();ui.beginSequence();ui.click("data-rank","J");
 const reopened=ui.reopen();assert.equal(reopened.state().active,null);assert.equal(reopened.state().view,"practice");
 assert.ok(reopened.app.innerHTML.includes('data-action="start-sequence"'));
 assert.equal(ui.state().q.input.rank,"J");
});

function focusSeed(sequence=false) {
 const d=emptyData(),now=50*86400000;
 d.settings.answerFormat="direct-recall";d.settings.sequenceAnswerFormat="direct-recall";
 const directions=sequence?["sequence-forward","sequence-backward"]:["card-number","number-card"];
 for(const direction of directions) {
  const session={id:"history-"+direction,mode:direction as any,answerFormat:"direct-recall" as const,startedAt:now-900000,endedAt:now-500000,duration:60000};
  d.sessions.push(session);
  for(let p=1;p<=8;p++)d.attempts.push({id:direction+p,sessionId:session.id,position:p,direction:direction as any,answerFormat:"direct-recall",at:now-600000+p,
   firstCorrect:p>5,wrong:p>5?0:1,hint:false,revealed:false,elapsedMs:p>5?1000:7000,interrupted:false,recentExposure:false,finalResult:p>5?"correct":"corrected"});
 }
 return d;
}
function answerCurrent(ui:ReturnType<typeof appHarness>) {
 if(ui.state().q.direction==="card-number"){for(const digit of String(ui.state().q.position))ui.key(digit);ui.key("Enter");}
 else ui.cardAnswer();
}
test("Practice owns both quiz types and Deck only offers the three browse views",()=>{
 const ui=appHarness();assert.equal(ui.state().view,"practice");
 assert.ok(ui.app.innerHTML.includes('data-practice-type="position" aria-pressed="true"'));
 ui.click("data-practice-type","sequence");assert.ok(ui.app.innerHTML.includes('data-action="start-sequence"'));
 assert.equal(ui.app.innerHTML.includes("Answer format</span>"),false);
 ui.click("data-practice-type","position");assert.ok(ui.app.innerHTML.includes('data-minutes="5"'));
 ui.click("data-view","deck");assert.equal(ui.app.innerHTML.includes('data-action="start-sequence"'),false);
 for(const view of ["browse","ribbon","grid"])assert.ok(ui.app.innerHTML.includes('data-deck-mode="'+view+'"'));
 ui.click("data-deck-mode","grid");assert.equal((ui.app.innerHTML.match(/data-browse-position="/g)??[]).length,52);
 ui.click("data-browse-position","31");assert.equal(ui.state().deckIndex,30);
 assert.ok(ui.app.innerHTML.includes('data-deck-mode="browse" aria-pressed="true"'));
 ui.click("data-deck-mode","ribbon");const next=ui.reload();
 assert.ok(next.app.innerHTML.includes('data-deck-mode="ribbon" aria-pressed="true"'));assert.equal(next.state().deckIndex,30);
});
for(const sequence of [false,true])test((sequence?"sequence":"position")+" weakest-five drill cycles three times, keeps direction and survives reload",()=>{
 let ui=appHarness(focusSeed(sequence));ui.click("data-view","progress");ui.click("data-stats-type",sequence?"sequence":"position");
 assert.equal(ui.app.innerHTML.includes('data-action="drill-weakest"'),false);
 ui.click("data-view","practice");ui.click("data-practice-type",sequence?"sequence":"position");
 ui.click(sequence?"data-sequence-format":"data-practice-format","direct-recall");if(sequence)ui.click('data-focus-sequence-scope','both');
 assert.ok(ui.app.innerHTML.includes("Drill weakest 5"));
 assert.equal(ui.app.innerHTML.includes("<h1>Progress</h1>"),false);
 assert.equal(ui.app.innerHTML.includes('id="all-cards" data-disclosure="cards" class="report-section" open'),false);
 const oldCount=ui.saved().attempts.length;ui.click("data-action","drill-weakest");
 const session=ui.state().active,chosen=JSON.parse(JSON.stringify(session.focus.mappings));
 assert.equal(session.focus.target,15);assert.equal(session.answerFormat,"direct-recall");assert.equal(session.runTarget,undefined);
 assert.equal(chosen.length,5);assert.ok(new Set(chosen.map((m:any)=>m.direction)).size===2);
 const prompts:string[]=[];
 for(let i=0;i<15;i++){
  if(i===6){const id=ui.state().q.id;ui=ui.reload(60000);assert.equal(ui.state().paused,true);assert.equal(ui.state().q.id,id);ui.click("data-action","pause");}
  const q=ui.state().q;prompts.push(q.direction+":"+q.position);
  assert.equal(q.position,chosen[i%5].position);assert.equal(q.direction,chosen[i%5].direction);
  ui.advance(200);answerCurrent(ui);
 }
 const d=ui.saved(),finished=d.sessions.at(-1);assert.equal(d.attempts.length,oldCount+15);
 assert.equal(finished.focus.completed,true);assert.equal(finished.focus.elapsedMs,3000);
 assert.equal(new Set(prompts).size,5);assert.deepEqual(prompts.slice(0,5),prompts.slice(5,10));
 assert.ok(ui.dialogHtml().includes("Drill complete"));assert.deepEqual(validate(d),d);
 ui.click("data-action","summary-progress");assert.ok(ui.app.innerHTML.includes("Drill 5"));
});
test("early drill endings preserve wrong answers, hints and incomplete status",()=>{
 const ui=appHarness(focusSeed());ui.click("data-view","progress");ui.click("data-stats-type","position");ui.click("data-stats-direction","number-card");
 ui.click("data-view","practice");ui.click("data-practice-type","position");ui.click("data-mode","number-card");ui.click("data-practice-format","direct-recall");ui.click("data-action","drill-weakest");
 ui.click("data-rank","J");ui.advance(300);ui.click("data-suit","D");
 assert.ok(ui.app.innerHTML.includes("Incorrect: Jack of Diamonds"));assert.equal(ui.state().q.input.rank,"");
 ui.click("data-action","hint");ui.advance(200);ui.cardAnswer();ui.click("data-action","finish");
 const d=ui.saved(),a=d.attempts.at(-1);assert.equal(a.firstCorrect,false);assert.equal(a.wrong,1);assert.equal(a.hint,true);
 assert.equal(a.elapsedMs,300);assert.equal(a.finalElapsedMs,500);assert.equal(d.sessions.at(-1).focus.completed,false);
 assert.ok(ui.dialogHtml().includes("Drill ended"));assert.deepEqual(validate(d),d);
});
test("legacy Deck quiz preferences migrate to Practice without losing setup or history",()=>{
 const d=emptyData();d.settings.sequenceAnswerFormat="direct-recall";
 const old={version:1,view:"deck",deckMode:"quiz",sequenceDirection:"sequence-backward",sequenceStart:"random",filter:"sequence"};
 const ui=appHarness(d,{local:new Map([["deckwise.ui.v1",JSON.stringify(old)]])});
 assert.equal(ui.state().view,"practice");
 assert.ok(ui.app.innerHTML.includes('data-sequence-direction="sequence-backward" aria-pressed="true"'));
 assert.ok(ui.app.innerHTML.includes('data-sequence-start="random" aria-pressed="true"'));
 assert.deepEqual(ui.saved(),d);
});

test("card and session disclosures retain their state through sorting and reload",()=>{
 let ui=appHarness(focusSeed());ui.click("data-view","progress");ui.click("data-stats-type","position");
 ui.toggle("all-cards",true);ui.choose("card-sort","mastery");ui.toggle("session-history",true);
 ui=ui.reload();assert.ok(ui.app.innerHTML.includes('id="all-cards" data-disclosure="cards" class="report-section" open'));
 assert.ok(ui.app.innerHTML.includes('id="session-history" data-disclosure="history" class="report-section" open'));
 assert.ok(ui.app.innerHTML.includes('value="mastery" selected'));
 ui.toggle("all-cards",false);ui=ui.reload();
 assert.equal(ui.app.innerHTML.includes('id="all-cards" data-disclosure="cards" class="report-section" open'),false);
});

test("selectors put Direct recall first and reports put Position practice and Mixed first without changing selections",()=>{
 const ui=appHarness();
 const order=(attribute:string)=>[...ui.app.innerHTML.matchAll(new RegExp(attribute+'="([^"]+)"','g'))].map(m=>m[1]);
 ui.click('data-practice-type','sequence');assert.deepEqual(order('data-sequence-format'),['direct-recall','multiple-choice']);
 assert.ok(ui.app.innerHTML.includes('data-sequence-format="multiple-choice" aria-pressed="true"'));
 ui.click('data-practice-type','position');assert.deepEqual(order('data-practice-format'),['direct-recall','multiple-choice']);
 ui.click('data-view','progress');
 assert.deepEqual(order('data-stats-type'),['position','sequence']);
 assert.deepEqual(order('data-report-format'),['direct-recall','multiple-choice','all']);
 ui.click('data-stats-type','position');assert.deepEqual(order('data-stats-direction'),['all','card-number','number-card']);
 ui.click('data-stats-direction','number-card');ui.click('data-report-format','direct-recall');
 const reloaded=ui.reload();assert.ok(reloaded.app.innerHTML.includes('data-stats-direction="number-card" aria-pressed="true"'));
 assert.ok(reloaded.app.innerHTML.includes('data-report-format="direct-recall" aria-pressed="true"'));
 ui.click('data-view','settings');assert.ok(ui.app.innerHTML.includes('Prioritize slower recall'));
});

function dateWindowSeed() {
 const d=emptyData(),now=50*86400000;
 for(const direction of ['card-number','number-card','sequence-forward','sequence-backward'] as const)
 for(const format of ['multiple-choice','direct-recall'] as const)
 for(const age of [1,10,40]) {
  const at=now-age*86400000,id=`${direction}-${format}-${age}`;
  d.sessions.push({id,mode:direction,answerFormat:format,startedAt:at-10000,endedAt:at+2000,duration:60000});
  for(let i=0;i<2;i++){
   const correct=age===1||age===10&&i===0;
   d.attempts.push({id:id+i,sessionId:id,position:age===1?i+1:age===10?i+3:i+5,direction,answerFormat:format,at:at+i,
    firstCorrect:correct,wrong:correct?0:1,hint:false,revealed:false,elapsedMs:age===1?1000+i*1000:8000,interrupted:false,recentExposure:false});
  }
 }
 return d;
}
for(const family of ['position','sequence'])test(`${family} report controls filter multiweek history, counts, metrics, dates and sessions`,()=>{
 let ui=appHarness(dateWindowSeed());const raw=JSON.stringify(ui.saved().attempts);
 ui.click('data-view','progress');ui.click('data-stats-type',family);
 const direction=family==='position'?'card-number':'sequence-forward';
 ui.click('data-stats-direction',direction);
 for(const format of ['direct-recall','multiple-choice','all']){
  ui.click('data-report-format',format);const factor=format==='all'?2:1;
  for(const [period,n,accuracy,median] of [['7',2,'100%','1.5s'],['30',4,'75%','2.0s'],['all',6,'50%','2.0s']] as const){
   ui.click('data-stats-period',period);
   const panel=ui.app.innerHTML.split('class="summary-grid stat-cards"')[1].split('</div></div>')[0];
   assert.ok(panel.includes(`<strong>${n*factor}</strong><span>Questions answered</span>`));
   assert.ok(panel.includes(`<strong>${accuracy}</strong>`));assert.ok(panel.includes(`<strong>${median}</strong>`));
   assert.match(ui.app.innerHTML,new RegExp(`${n*factor} of ${6*factor} answers`));
   assert.ok(ui.app.innerHTML.includes(`Sessions (${(n/2)*factor})`));
  }
 }
 ui.click('data-report-format','direct-recall');ui.click('data-stats-period','7');
 const coverage=ui.app.innerHTML.match(/aria-label="Results coverage">([^<]*)/)![1];
 assert.match(coverage,/2 of 6 answers/);assert.ok(coverage.includes(new Date(49*86400000).toLocaleDateString(undefined,{month:"short",day:"numeric"})));assert.equal(coverage.includes(new Date(40*86400000).toLocaleDateString(undefined,{month:"short",day:"numeric"})),false);
 ui.click('data-stats-direction',family==='position'?'all':'sequence');
 assert.ok(ui.app.innerHTML.includes('4 of 12 answers'));
 if(family==='position'){
  ui.click('data-view','practice');ui.click('data-practice-type','position');ui.click('data-mode','card-number');ui.click('data-practice-format','direct-recall');
  assert.equal(ui.app.innerHTML.includes('data-stats-period'),false);assert.equal(ui.app.innerHTML.includes('Independent accuracy'),false);
  ui.click('data-view','progress');ui.click('data-stats-period','30');assert.ok(ui.app.innerHTML.includes('8 of 12 answers'));
 }
 ui=ui.reload();assert.equal(JSON.stringify(ui.saved().attempts),raw);
});

test("Ribbon counter, slider and reload follow its center card at both ends and during swipes",()=>{
 let ui=appHarness(emptyData());ui.click('data-view','deck');ui.click('data-deck-mode','ribbon');
 const gallery=()=>ui.app.querySelector('.gallery');
 assert.equal(gallery().scrollLeft,0);assert.equal(ui.state().deckIndex,0);
 ui.click('data-action','following');assert.equal(gallery().scrollLeft,80);assert.equal(ui.state().deckIndex,1);
 assert.equal(ui.app.querySelector('#deck-position').textContent,'2 of 52');assert.equal(ui.app.querySelector('#jump').value,'2');
 gallery().scrollTo({left:80*17.45});assert.equal(ui.state().deckIndex,17);assert.equal(ui.app.querySelector('#deck-position').textContent,'18 of 52');
 ui=ui.reload();assert.equal(gallery().scrollLeft,80*17);assert.equal(ui.state().deckIndex,17);
 ui.choose('jump','52');assert.equal(gallery().scrollLeft,80*51);assert.equal(ui.app.querySelector('#deck-position').textContent,'52 of 52');
 ui.click('data-action','following');assert.equal(ui.state().deckIndex,51);
 ui.choose('jump','1');assert.equal(gallery().scrollLeft,0);assert.equal(ui.app.querySelector('#deck-position').textContent,'1 of 52');
 const answers=JSON.stringify(ui.saved().attempts);ui.click('data-deck-mode','browse');assert.equal(gallery().scrollLeft,0);
 assert.equal(JSON.stringify(ui.saved().attempts),answers);
});

test("Practice defaults to Position and Mixed, matches report order, and has setup controls only",()=>{
 let ui=appHarness();const order=(attribute:string)=>[...ui.app.innerHTML.matchAll(new RegExp(attribute+'="([^"]+)"','g'))].map(m=>m[1]);
 assert.deepEqual(order('data-practice-type'),['position','sequence']);assert.deepEqual(order('data-mode'),['mixed','card-number','number-card']);
 assert.ok(ui.app.innerHTML.includes('data-practice-type="position" aria-pressed="true"'));assert.ok(ui.app.innerHTML.includes('data-mode="mixed" aria-pressed="true"'));
 for(const text of ['practice-stats','data-stats-period','Independent accuracy','Median recall','Cards practiced'])assert.equal(ui.app.innerHTML.includes(text),false);
 for(const minutes of ['1','3','5','10'])assert.ok(ui.app.innerHTML.includes('data-minutes="'+minutes+'"'));
 ui.click('data-practice-type','sequence');ui=ui.reload();assert.ok(ui.app.innerHTML.includes('data-practice-type="sequence" aria-pressed="true"'));
 ui.click('data-practice-type','position');ui.click('data-mode','number-card');ui=ui.reload();assert.ok(ui.app.innerHTML.includes('data-mode="number-card" aria-pressed="true"'));
});

test("Recently deleted starts collapsed and retains the restore action",()=>{
 const d=focusSeed();assert.equal(deleteSession(d,d.sessions[0].id),true);
 const ui=appHarness(d);ui.click('data-view','progress');
 assert.ok(ui.app.innerHTML.includes('<details class="report-section deleted-history"><summary>Recently deleted (1)</summary>'));
 assert.ok(ui.app.innerHTML.includes('data-restore-session="history-card-number"'));
 assert.equal(ui.saved().deletedSessions.length,1);
});

test("All 52 cards follows the selected date range and labels it instead of silently showing lifetime",()=>{
 const ui=appHarness(dateWindowSeed());ui.click('data-view','progress');ui.click('data-stats-type','position');ui.click('data-stats-direction','card-number');ui.click('data-report-format','direct-recall');
 const table=()=>ui.app.innerHTML.split('id="all-cards"')[1].split('</details>')[0];
 const row=(position:number)=>table().split('<tr>').find((r:string)=>r.includes('data-position="'+position+'"'))!;
 ui.click('data-stats-period','7');assert.ok(table().includes('· 7 days'));assert.ok(row(3).includes('<td>—'));
 ui.click('data-stats-period','30');assert.ok(table().includes('· 30 days'));assert.ok(row(3).includes('<td>1<small'));assert.ok(row(5).includes('<td>—'));
 ui.click('data-stats-period','all');assert.ok(table().includes('· All time'));assert.ok(row(5).includes('<td>1<small'));
});
function trendSeed() {
 const d=emptyData(),now=50*86400000;d.settings.answerFormat='direct-recall';
 for(const [day,count,focused] of [[3,60,false],[2,60,false],[1,15,true]] as const){
  const at=now-day*86400000+10*3600000,id='trend-'+day;
  d.sessions.push({id,mode:'card-number',answerFormat:'direct-recall',startedAt:at,endedAt:at+count*1000+1000,duration:120000,
   ...(focused?{focus:{mappings:Array.from({length:5},(_,i)=>({position:i+1,direction:'card-number' as const})),target:15,elapsedMs:15000,completed:true}}:{})});
  for(let i=0;i<count;i++)d.attempts.push({id:id+i,sessionId:id,position:i%(focused?5:20)+1,direction:'card-number',answerFormat:'direct-recall',at:at+i*1000,firstCorrect:!focused,wrong:focused?1:0,hint:false,revealed:false,elapsedMs:focused?9000:2000,interrupted:false,recentExposure:false});
 }
 return d;
}
test("Progress plots daily rolling general practice while focused drills remain in totals and history",()=>{
 const d=trendSeed(),ui=appHarness(d);ui.click('data-view','progress');ui.click('data-report-format','direct-recall');
 const chart=(html:string)=>html.split('class="chart progress-trend"')[1].split('</details>')[0];
 assert.ok(chart(ui.app.innerHTML).includes('General practice trend'));assert.ok(chart(ui.app.innerHTML).includes('all eligible general-practice answers'));
 assert.ok(chart(ui.app.innerHTML).includes('drills excluded'));assert.ok(chart(ui.app.innerHTML).includes('speed-target-line'));
 assert.equal(chart(ui.app.innerHTML).includes('Last 20 sessions'),false);
 assert.ok(ui.app.innerHTML.includes('<strong>135</strong><span>Questions answered</span>'));assert.ok(ui.app.innerHTML.includes('Drill 5'));
 const without=structuredClone(d);without.sessions=without.sessions.filter(s=>!s.focus);without.attempts=without.attempts.filter(a=>a.sessionId!=='trend-1');
 const other=appHarness(without);other.click('data-view','progress');other.click('data-report-format','direct-recall');
 assert.equal(chart(ui.app.innerHTML),chart(other.app.innerHTML));assert.deepEqual(ui.saved().attempts,d.attempts);
});
test("All formats shows independent progress charts and sparse or drill-only history never plots a misleading point",()=>{
 const d=trendSeed(),s={id:'legacy-trend',mode:'card-number' as const,startedAt:47*86400000,endedAt:47*86400000+60000,duration:60000};
 d.sessions.push(s);d.attempts.push(...d.attempts.filter(a=>a.sessionId==='trend-3').slice(0,20).map((a,i)=>({...a,id:'legacy'+i,sessionId:s.id,at:s.startedAt+i*1000,answerFormat:undefined,elapsedMs:1000})));
 const ui=appHarness(d);ui.click('data-view','progress');ui.click('data-report-format','all');
 assert.equal((ui.app.innerHTML.match(/class="chart progress-trend"/g)??[]).length,2);
 assert.ok(ui.app.innerHTML.includes('<small>Direct recall</small>'));assert.ok(ui.app.innerHTML.includes('<small>Multiple choice</small>'));
 const only=structuredClone(d);only.sessions=only.sessions.filter(s=>s.focus);only.attempts=only.attempts.filter(a=>a.sessionId==='trend-1');
 const drill=appHarness(only);drill.click('data-view','progress');drill.click('data-report-format','direct-recall');
 const chart=drill.app.innerHTML.split('class="chart progress-trend"')[1].split('</div>')[0];
 assert.equal(drill.app.innerHTML.includes('Daily rolling general-practice accuracy'),false);
 assert.ok(drill.app.innerHTML.includes('No eligible general-practice answers in this graph range'));
 assert.ok(drill.app.innerHTML.includes('Drill 5'));
});
for(const format of ['direct-recall','multiple-choice'])for(const mode of ['card-number','number-card','mixed'])test(`${format} ${mode} benchmark covers every mapping once and survives misses and reload`,()=>{
 let ui=appHarness();ui.click('data-mode',mode);ui.click('data-practice-format',format);ui.click('data-action','start-benchmark');
 const planned=JSON.parse(JSON.stringify(ui.state().active.benchmark.mappings)),target=mode==='mixed'?104:52;
 for(let i=0;i<target;i++){
  if(i===3){const id=ui.state().q.id;ui=ui.reload(5000);assert.equal(ui.state().q.id,id);assert.equal(ui.state().paused,true);ui.click('data-action','pause');}
  const q=ui.state().q;assert.equal(q.position,planned[i].position);assert.equal(q.direction,planned[i].direction);
  if(i===1&&format==='multiple-choice'){const wrong=q.options.find((p:number)=>p!==q.position);ui.click('data-answer',String(wrong));assert.equal(ui.state().q.firstCorrect,false);}
  ui.advance(1000);if(format==='direct-recall')answerCurrent(ui);else ui.click('data-answer',String(q.position));
 }
 const d=ui.saved(),s=d.sessions.at(-1);assert.equal(s.benchmark.completed,true);assert.equal(d.attempts.length,target);
 assert.equal(new Set(d.attempts.map((a:any)=>a.direction+':'+a.position)).size,target);
 assert.ok(ui.dialogHtml().includes('Benchmark complete'));assert.deepEqual(validate(d),d);
 ui.click('data-action','summary-progress');assert.ok(ui.app.innerHTML.includes('Benchmarks (1)'));assert.ok(ui.app.innerHTML.includes('Benchmark · '+target+'/'+target));
});
test('partial benchmark remains partial and correction submissions survive reload, backup and confusion practice',()=>{
 let ui=appHarness();ui.begin('card-number');const expected=ui.state().q.position,wrong=expected===7?8:7;
 ui.key(String(wrong));ui.advance(400);ui.key('Enter');const original=ui.saved().attempts[0];
 assert.equal(original.submissions[0].position,wrong);ui=ui.reload();ui.click('data-action','pause');
 for(const digit of String(expected))ui.key(digit);ui.advance(300);ui.key('Enter');
 ui.click('data-action','finish');ui.click('data-action','summary-progress');
 const a=ui.saved().attempts[0];assert.equal(a.submissions.length,2);assert.equal(a.submissions[1].position,expected);assert.equal(a.firstCorrect,false);assert.equal(a.elapsedMs,400);
 assert.ok(ui.app.innerHTML.includes('Confusions (1)'));ui.click('data-confusion','0');assert.equal(ui.state().active.focus.kind,'confusion');
 for(let i=0;i<6;i++){ui.advance(1000);answerCurrent(ui);}
 assert.equal(ui.saved().sessions.at(-1).focus.completed,true);assert.deepEqual(validate(ui.saved()),ui.saved());
 ui.click('data-action','summary-progress');ui.click('data-view','practice');ui.click('data-action','start-benchmark');ui.advance(500);answerCurrent(ui);ui.click('data-action','finish');
 assert.equal(ui.saved().sessions.at(-1).benchmark.completed,false);assert.ok(ui.dialogHtml().includes('Benchmark ended'));
});
test('six/eight mapping drills persist their size and offer one-pass delayed rechecks without becoming general practice',()=>{
 let ui=appHarness(focusSeed());ui.click('data-view','practice');ui.click('data-practice-format','direct-recall');ui.click('data-focus-size','6');
 assert.ok(ui.app.innerHTML.includes('Drill weakest 6'));ui=ui.reload();assert.equal(ui.saved().settings.focusSize,6);
 ui.click('data-action','drill-weakest');for(let i=0;i<18;i++){ui.advance(1000);answerCurrent(ui);}
 const source=ui.saved().sessions.at(-1);assert.equal(source.focus.mappings.length,6);assert.equal(source.focus.completed,true);
 ui.click('data-action','summary-progress');ui.click('data-view','practice');assert.ok(ui.app.innerHTML.includes('Recheck 6 mappings'));
 assert.ok(ui.app.innerHTML.includes('One question per mapping, 30 minutes after a drill and again the next day.'));
 assert.ok(ui.app.innerHTML.includes('After a 30-minute delay'));assert.ok(ui.app.innerHTML.includes(' drill</small>'));
 assert.equal(ui.app.querySelector('[data-recheck="'+source.id+'"]').disabled,true);
 const before=ui.saved().sessions.length;ui.click('data-recheck',source.id);assert.equal(ui.saved().sessions.length,before);
 ui=ui.reload(30*60000);assert.ok(ui.app.innerHTML.includes('Ready now'));ui.click('data-recheck',source.id);assert.equal(ui.state().active.focus.kind,'recheck');assert.equal(ui.state().active.focus.target,6);
 for(let i=0;i<6;i++){ui.advance(1000);answerCurrent(ui);}
 assert.ok(ui.dialogHtml().includes('Recheck complete'));assert.equal(ui.saved().sessions.at(-1).focus.recheckStage,'later');
 ui.click('data-action','summary-progress');ui.click('data-view','practice');assert.ok(ui.app.innerHTML.includes('Next-day'));
 ui=ui.reload(24*3600000);ui.click('data-recheck',source.id);for(let i=0;i<6;i++){ui.advance(1000);answerCurrent(ui);}
 assert.equal(ui.saved().sessions.at(-1).focus.recheckStage,'next-day');assert.deepEqual(validate(ui.saved()),ui.saved());
 ui.click('data-action','summary-progress');ui.click('data-view','practice');ui.click('data-focus-size','8');assert.ok(ui.app.innerHTML.includes('Drill weakest 8'));
});
test('Settings exposes a complete plain-English learning guide',()=>{
 const ui=appHarness();ui.click('data-view','settings');ui.click('data-action','learning-guide');
 for(const text of ['How learning works','The recall score','How adaptive practice selects a prompt','Delayed rechecks','Confusion pairs','Balanced random-access benchmarks','Daily graphs and report totals','three quarters','15%','85%'])assert.ok(ui.dialogHtml().includes(text),text);
});
test('daily chart keeps morning and late-night answers on the oldest selected calendar day',()=>{
 const d=emptyData(),now=50*86400000,start=new Date(now);start.setHours(0,0,0,0);start.setDate(start.getDate()-6);
 const at=start.getTime(),s={id:'whole-day',mode:'card-number' as const,answerFormat:'direct-recall' as const,startedAt:at,endedAt:at+23*3600000,duration:60000};
 d.sessions=[s];d.attempts=Array.from({length:200},(_,i)=>({id:'whole'+i,sessionId:s.id,position:i%20+1,direction:'card-number' as const,answerFormat:'direct-recall' as const,at:at+(i<100?3600000:22*3600000)+i,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:i<100?2000:8000,interrupted:false,recentExposure:false}));
 const ui=appHarness(d);ui.click('data-view','progress');ui.click('data-report-format','direct-recall');ui.click('data-trend-period','7');
 const chart=ui.app.innerHTML.split('class="chart progress-trend"')[1].split('</details>')[0];
 assert.ok(chart.includes('<td>200<br/>'));assert.ok(chart.includes('5.0s'));assert.ok(chart.includes('all eligible general-practice answers'));
});
test('an immediately repeated six-mapping drill shows practice results without creating independent evidence',()=>{
 const seed=focusSeed();
 for(const a of seed.attempts)a.at=50*86400000-10000;
 const ui=appHarness(seed);ui.click('data-view','practice');ui.click('data-practice-format','direct-recall');ui.click('data-focus-size','6');
 ui.click('data-action','drill-weakest');
 for(let i=0;i<18;i++){ui.advance(1000);answerCurrent(ui);}
 const d=ui.saved(),session=d.sessions.at(-1),answers=d.attempts.filter((a:any)=>a.sessionId===session.id);
 assert.equal(answers.length,18);assert.ok(answers.every((a:any)=>a.firstCorrect&&a.recentExposure));
 assert.ok(ui.dialogHtml().includes('100%'),'A completed all-correct drill needs visible practice accuracy');
 assert.ok(ui.dialogHtml().includes('1.0s'),'Eligible practice timing includes repeats');
 assert.ok(ui.dialogHtml().includes('Practice median'));
 assert.ok(ui.dialogHtml().includes('0 independent samples'));
 assert.ok(ui.dialogHtml().includes('18 recently seen'));
 assert.ok(ui.dialogHtml().includes('6 mappings · 3 rounds'));
 assert.deepEqual(validate(d),d);
 ui.click('data-action','summary-progress');
 assert.ok(ui.app.innerHTML.includes('100%'));
 ui.click('data-session',session.id);assert.ok(ui.dialogHtml().includes('Practice median'));
});
test('recheck entries identify remaining mapping counts, source drills and additional checks',()=>{
 const d=focusSeed(),now=50*86400000;
 for(const [i,positions] of [[0,[1,2,3]],[1,[1,2]],[2,[4]],[3,[5]]] as const){
  const endedAt=now-3600000+i*60000,id='source-'+i;
  d.sessions.push({id,mode:'card-number',answerFormat:'direct-recall',startedAt:endedAt-10000,endedAt,duration:0,
   focus:{mappings:positions.map(position=>({position,direction:'card-number'})),target:positions.length*3,elapsedMs:10000,completed:true}});
  for(let n=0;n<positions.length*3;n++)d.attempts.push({id:id+'-'+n,sessionId:id,position:positions[n%positions.length],direction:'card-number',answerFormat:'direct-recall',
   at:endedAt-10000+n,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:n>=positions.length});
 }
 const ui=appHarness(d);ui.click('data-view','practice');
 const panel=ui.app.innerHTML.split('aria-label="Delayed rechecks"')[1];
 assert.ok(panel.includes('Recheck 1 mapping'));assert.ok(panel.includes('Recheck 2 mappings'));
 assert.ok(panel.includes('More rechecks (1)'));assert.equal((panel.match(/data-recheck="source-/g)??[]).length,4);
 assert.equal((panel.match(/Ready now/g)??[]).length,4);assert.equal((panel.match(/After a 30-minute delay/g)??[]).length,4);
 for(let i=0;i<4;i++)assert.equal(ui.app.querySelector('[data-recheck="source-'+i+'"]').disabled,false);
 ui.click('data-recheck','source-0');assert.equal(ui.state().active.focus.target,1);assert.equal(ui.state().q.position,3);
 assert.equal(ui.state().active.focus.passes,1);assert.deepEqual(validate(ui.saved()),ui.saved());
});

test('reveal requests can be cancelled without changing answers, input or grading in any quiz format',()=>{
 for(const format of ['direct-recall','multiple-choice'])for(const mode of ['card-number','number-card','sequence-forward','sequence-backward']){
  const ui=appHarness();if(mode.startsWith('sequence'))ui.beginSequence(mode,format);else ui.begin(mode,format);
  if(format==='direct-recall'){if(mode==='card-number')ui.key('0');else ui.click('data-rank','J');}
  const input=JSON.stringify(ui.state().q.input),id=ui.state().q.id,before=ui.saved();
  ui.click('data-action','reveal');
  assert.ok(ui.dialogHtml().includes('Reveal answer?'));assert.ok(ui.dialogHtml().includes('autofocus>Keep trying'));
  assert.equal(ui.state().q.revealed,false);assert.equal(ui.state().q.id,id);assert.equal(JSON.stringify(ui.state().q.input),input);
  assert.deepEqual(ui.saved(),before);ui.key('Enter');assert.deepEqual(ui.saved(),before);
  ui.click('data-action','close-dialog');assert.equal(ui.state().q.done,false);assert.equal(ui.state().q.firstCorrect,null);
  if(mode==='card-number'&&format==='direct-recall')ui.key('Escape');
  ui.advance(1000);if(format==='multiple-choice')ui.click('data-answer',String(ui.state().q.position));else answerCurrent(ui);
  const a=ui.saved().attempts[0];assert.equal(a.firstCorrect,true);assert.equal(a.revealed,false);assert.equal(a.hint,false);assert.equal(a.interrupted,false);
 }
});
test('only explicit reveal confirmation records the reveal and preserves sequence penalties',()=>{
 for(const format of ['direct-recall','multiple-choice'])for(const mode of ['card-number','number-card','sequence-forward','sequence-backward']){
  const ui=appHarness();if(mode.startsWith('sequence'))ui.beginSequence(mode,format);else ui.begin(mode,format);
  const id=ui.state().q.id;ui.advance(600);ui.click('data-action','reveal');assert.equal(ui.saved().attempts.length,0);
  assert.equal(ui.dialogHtml().includes('5-second penalty'),mode.startsWith('sequence'));
  ui.advance(400);ui.click('data-confirm-reveal',id);
  const a=ui.saved().attempts[0];assert.equal(a.revealed,true);assert.equal(a.firstCorrect,false);assert.equal(a.finalResult,'revealed');assert.equal(a.elapsedMs,1000);
  assert.ok(ui.app.innerHTML.includes('Answer revealed'));assert.deepEqual(validate(ui.saved()),ui.saved());
  if(mode.startsWith('sequence')){ui.click('data-action','finish');assert.ok(ui.dialogHtml().includes('+5s'));}
 }
});

function longTrendSeed() {
 const d=emptyData(),now=200*86400000+12*3600000;d.settings.answerFormat='direct-recall';
 for(let age=0;age<100;age++){
  const date=new Date(now);date.setHours(1,0,0,0);date.setDate(date.getDate()-age);
  const at=date.getTime(),id='long-'+age;
  d.sessions.push({id,mode:'card-number',answerFormat:'direct-recall',startedAt:at,endedAt:at+2000,duration:60000});
  d.attempts.push({id:'answer-'+age,sessionId:id,position:age%52+1,direction:'card-number',answerFormat:'direct-recall',at:at+1000,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:2000,interrupted:false,recentExposure:false});
 }
 return {d,now};
}
test('graph defaults to 30 whole days independently, expands beyond 30 points and remembers its own range',()=>{
 const {d,now}=longTrendSeed();let ui=appHarness(d,{wallAt:now});ui.click('data-view','progress');
 const chart=()=>ui.app.innerHTML.split('class="chart progress-trend"')[1].split('</details>')[0];
 const days=()=>(chart().match(/<tr><td>/g)??[]).length;
 assert.ok(chart().includes('data-trend-period="30" aria-pressed="true"'));assert.equal(days(),30);
 assert.ok(ui.app.innerHTML.includes('<strong>7</strong><span>Questions answered</span>'));
 ui.click('data-trend-period','90');assert.equal(days(),90);assert.equal(ui.saved().settings.statsPeriod,d.settings.statsPeriod);
 ui.click('data-trend-period','all');assert.equal(days(),100);
 ui.click('data-trend-period','7');assert.equal(days(),7);const seven=chart();
 ui.click('data-stats-period','all');assert.equal(chart(),seven);assert.ok(ui.app.innerHTML.includes('<strong>100</strong><span>Questions answered</span>'));
 ui=ui.reload();assert.ok(chart().includes('data-trend-period="7" aria-pressed="true"'));assert.equal(days(),7);
 ui=ui.reopen();assert.ok(chart().includes('data-trend-period="7" aria-pressed="true"'));assert.deepEqual(ui.saved().attempts,d.attempts);
});
test('older chart evidence remains visible when the report week is empty and an empty chart can change ranges',()=>{
 const {d,now}=longTrendSeed();d.sessions=d.sessions.filter(s=>s.id==='long-20');d.attempts=d.attempts.filter(a=>a.sessionId==='long-20');
 const ui=appHarness(d,{wallAt:now});ui.click('data-view','progress');
 assert.ok(ui.app.innerHTML.includes('Daily accuracy &amp; speed'));assert.ok(ui.app.innerHTML.includes('No results in this view'));
 ui.click('data-trend-period','7');assert.ok(ui.app.innerHTML.includes('No eligible general-practice answers in this graph range'));
 ui.click('data-trend-period','30');assert.ok(ui.app.innerHTML.includes('Daily accuracy &amp; speed'));
 assert.equal(ui.saved().attempts.length,1);
});

test('Practice owns weakest drills above rechecks, keeps its own scope and launches a guided drill/recheck loop',()=>{
 const d=focusSeed();d.attempts=d.attempts.filter(a=>a.direction==='card-number'&&a.position===1);
 const original=d.attempts[0];d.attempts=Array.from({length:4},(_,i)=>({...original,id:'miss-'+i,at:original.at+i}));
 const ui=appHarness(d);ui.click('data-view','progress');assert.equal(ui.app.innerHTML.includes('aria-label="Drill weakest"'),false);
 ui.click('data-stats-direction','number-card');ui.click('data-stats-period','7');ui.click('data-view','practice');
 assert.ok(ui.app.innerHTML.includes('Strengthen your weakest 1'));assert.ok(ui.app.innerHTML.includes('data-action="start"'));
 ui.click('data-action','start-suggestion');assert.equal(ui.state().active.focus.target,3);assert.equal(ui.state().active.answerFormat,'direct-recall');
 for(let i=0;i<3;i++){ui.advance(1000);answerCurrent(ui);}
 ui.click('data-action','summary-practice');
 assert.ok(ui.app.innerHTML.indexOf('aria-label="Drill weakest"')<ui.app.innerHTML.indexOf('aria-label="Delayed rechecks"'));
 assert.ok(ui.app.innerHTML.includes('not ready yet'));assert.ok(ui.app.innerHTML.includes('Benchmark · 104 prompts'));
 const later=ui.reload(30*60000);assert.ok(later.app.innerHTML.includes('Check what stuck: 1 mapping'));
 later.click('data-action','start-suggestion');assert.equal(later.state().active.focus.kind,'recheck');assert.equal(later.state().active.focus.target,1);
 later.advance(1000);answerCurrent(later);assert.ok(later.dialogHtml().includes('Recheck complete'));assert.deepEqual(validate(later.saved()),later.saved());
});
test('a suggested full-coverage baseline launches the selected format without changing manual access',()=>{
 const {d,now}=longTrendSeed(),ui=appHarness(d,{wallAt:now});
 assert.ok(ui.app.innerHTML.includes('Take a balanced baseline'));assert.ok(ui.app.innerHTML.includes('How it works'));
 assert.ok(ui.app.innerHTML.includes('data-action="start-benchmark"'));ui.click('data-action','start-suggestion');
 assert.equal(ui.state().active.benchmark.mappings.length,104);assert.equal(ui.state().active.answerFormat,'direct-recall');assert.equal(ui.saved().attempts.length,100);
});
test('a recurring confusion suggestion launches the pair and a sequence suggestion introduces the untried direction',()=>{
 const d=emptyData(),now=50*86400000;d.settings.answerFormat='direct-recall';
 d.sessions=[{id:'mix',mode:'card-number',answerFormat:'direct-recall',startedAt:now-600000,endedAt:now-590000,duration:60000}];
 d.attempts=Array.from({length:3},(_,i)=>({id:'m'+i,sessionId:'mix',position:1,direction:'card-number',answerFormat:'direct-recall',at:now-600000+i*1000,elapsedMs:1000,firstCorrect:false,wrong:1,hint:false,revealed:false,interrupted:false,recentExposure:false,submissions:[{position:2,at:now-600000+i*1000,elapsedMs:1000}]}));
 const ui=appHarness(d);assert.ok(ui.app.innerHTML.includes('Untangle a recurring mix-up'));ui.click('data-action','start-suggestion');assert.equal(ui.state().active.focus.kind,'confusion');assert.equal(ui.state().active.focus.target,6);
 const seq=emptyData();seq.settings.sequenceAnswerFormat='direct-recall';
 seq.sessions=[{id:'forward',mode:'sequence-forward',answerFormat:'direct-recall',startedAt:now-600000,endedAt:now-548000,duration:0,runTarget:52,startPosition:1,elapsedMs:52000,completed:true}];
 seq.attempts=STACK.map((_,i)=>({id:'s'+i,sessionId:'forward',position:i+1,direction:'sequence-forward',answerFormat:'direct-recall',at:now-600000+i*1000,elapsedMs:1000,firstCorrect:true,wrong:0,hint:false,revealed:false,interrupted:false,recentExposure:false}));
 const run=appHarness(seq);run.click('data-practice-type','sequence');assert.ok(run.app.innerHTML.includes('Try a backward run'));run.click('data-action','start-suggestion');assert.equal(run.state().active.mode,'sequence-backward');assert.equal(run.state().q.position,52);assert.deepEqual(validate(run.saved()),run.saved());
});
