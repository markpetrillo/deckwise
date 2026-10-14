import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";
import {STACK,cardName,emptyData,validate,type Data} from "../src/core";

/** Run the real app against a small in-memory DOM, without touching browser data. */
function appHarness(seed?: Data) {
  let elapsed=0, id=0, dialog: any=null;
  const listeners = new Map<string,Function[]>();
  const stored = new Map<string,string>();
  if (seed) stored.set("deckwise.v1",JSON.stringify(seed));
  let fullWrites=0,panelWrites=0;
  const root = () => {
    let html="", buttons:any[]=[],fields:any[]=[];
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
        fields=Array.from(value.matchAll(/<select\b([^>]*)>/g),match=>{
          const id=match[1].match(/id="([^"]*)"/)?.[1];
          const events=new Map<string,Function>();
          return {id,events,addEventListener(name:string,fn:Function){events.set(name,fn);}};
        });
      },
      querySelectorAll(selector:string){
        const name=selector.match(/^\[([\w-]+)\]$/)?.[1];
        return name ? buttons.filter(b=>Object.hasOwn(b.attrs,name)) : [];
      },
      querySelector(selector:string){
        if(selector===".dialog-close")return {addEventListener(){}};
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
  const context=vm.createContext({
    document,window:{addEventListener(){},scrollTo(){}},navigator:{onLine:true},
    localStorage:{getItem:(key:string)=>stored.get(key)??null,setItem:(key:string,value:string)=>stored.set(key,value),removeItem:(key:string)=>stored.delete(key)},
    performance:{now:()=>elapsed},Date:class extends Date {static now(){return 50*86400000+elapsed;}},
    crypto:{randomUUID:()=>"id-"+(++id)},Math:Object.assign(Object.create(Math),{random:()=>0.2}),
    CSS:{escape:(s:string)=>s},setInterval(){},ResizeObserver:class{observe(){}disconnect(){}},console
  });
  const cache=new Map<string,any>();
  const load=(file:string):any=>{
    if(file.endsWith(".css"))return {};
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{} as any};cache.set(file,module);
    let source=readFileSync(file,"utf8").replaceAll("import.meta.env.PROD","false");
    if(file.endsWith("main.ts"))source+="\nglobalThis.__app={get data(){return data},get q(){return q},get paused(){return paused}};";
    const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const execute=vm.runInContext("(function(exports,require,module){"+output+"\n})",context,{filename:file});
    execute(module.exports,(name:string)=>load(resolve(dirname(file),name+(name.endsWith(".css")?"":".ts"))),module);
    return module.exports;
  };
  load(resolve("src/main.ts"));
  const state=()=> (context as any).__app;
  const click=(attr:string,value:string)=>(dialog??app).click(attr,value);
  const begin=(mode="card-number",format="direct-recall")=>{
    click("data-view","practice");click("data-practice-format",format);click("data-mode",mode);click("data-action","start");
  };
  const choose=(id:string,value:string)=>{const field=app.querySelector("#"+id);assert.ok(field?.events.get("change"));field.events.get("change")({target:{value}});};
  const beginSequence=(direction="sequence-forward",format="direct-recall",random=false)=>{
    click("data-view","deck");click("data-sequence-format",format);click("data-sequence-direction",direction);
    if(random)choose("sequence-start","random");click("data-action","start-sequence");
  };
  const cardAnswer=()=>{const [rank,suit]=STACK[state().q.position-1];click("data-rank",rank);click("data-suit",suit);};
  const key=(value:string)=>{
    let prevented=false;
    for(const fn of listeners.get("keydown")??[])fn({key:value,target:{tagName:"BODY"},preventDefault(){prevented=true;},ctrlKey:false,metaKey:false,altKey:false});
    return prevented;
  };
  return {app,begin,beginSequence,cardAnswer,click,key,state,choose,writes:()=>({full:fullWrites,panel:panelWrites}),advance:(ms:number)=>{elapsed+=ms;},document,
    visibility:(hidden:boolean)=>{document.hidden=hidden;for(const fn of listeners.get("visibilitychange")??[])fn();},
    dialogHtml:()=>dialog?.innerHTML??"",saved:()=>JSON.parse(stored.get("deckwise.v1")!)};
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
 ui.click("data-action","hint");ui.advance(500);ui.click("data-action","reveal");
 const a=ui.saved().attempts[0];assert.equal(a.interrupted,true);assert.equal(a.hint,true);assert.equal(a.revealed,true);
 assert.equal(a.answerFormat,"direct-recall");assert.equal(a.finalResult,"revealed");
 assert.ok(ui.app.innerHTML.includes("Answer revealed."));
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
 const ui=appHarness();
 ui.click("data-sequence-format","direct-recall");
 assert.equal(ui.saved().settings.sequenceAnswerFormat,"direct-recall");
 assert.equal(ui.saved().settings.answerFormat,"multiple-choice");
 ui.begin("number-card","multiple-choice");ui.click("data-action","finish");ui.click("data-action","summary-progress");
 ui.click("data-view","deck");
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
 ui.click("data-action","pause");ui.advance(4000);ui.click("data-action","pause");ui.advance(200);ui.click("data-action","reveal");
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
 const ui=appHarness(d);ui.click("data-view","progress");
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
 ui.click("data-rank","K");ui.click("data-action","reveal");
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
  ui.click("data-action","reveal");assert.deepEqual(positions(),[start,second]);
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
