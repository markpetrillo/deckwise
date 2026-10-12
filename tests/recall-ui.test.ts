import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";

/** Run the real app against a small in-memory DOM, without touching browser data. */
function appHarness() {
  let elapsed=0, id=0, dialog: any=null;
  const listeners = new Map<string,Function[]>();
  const stored = new Map<string,string>();
  const root = () => {
    let html="", buttons:any[]=[];
    const element:any = {
      get innerHTML(){return html;},
      set innerHTML(value:string){
        html=value;
        buttons=Array.from(value.matchAll(/<button\b([^>]*)>/g),match=>{
          const attrs=Object.fromEntries(Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g),m=>[m[1],m[2]]));
          const dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith("data-")).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
          return {attrs,dataset,disabled:/(?:^|\s)disabled(?:\s|$)/.test(match[1]),onclick:null,focus(){},addEventListener(){}};
        });
      },
      querySelectorAll(selector:string){
        const name=selector.match(/^\[([\w-]+)\]$/)?.[1];
        return name ? buttons.filter(b=>Object.hasOwn(b.attrs,name)) : [];
      },
      querySelector(selector:string){
        if(selector===".dialog-close")return {addEventListener(){}};
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
  const key=(value:string)=>{
    for(const fn of listeners.get("keydown")??[])fn({key:value,target:{tagName:"BODY"},preventDefault(){},ctrlKey:false,metaKey:false,altKey:false});
  };
  return {app,begin,click,key,state,advance:(ms:number)=>{elapsed+=ms;},document,
    visibility:(hidden:boolean)=>{document.hidden=hidden;for(const fn of listeners.get("visibilitychange")??[])fn();},
    saved:()=>JSON.parse(stored.get("deckwise.v1")!)};
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
 ui.click("data-suit",suit);ui.click("data-rank",wrongRank);ui.advance(700);
 ui.click("data-action","recall-submit");
 assert.equal(ui.saved().attempts[0].firstCorrect,false);
 assert.equal(ui.click("data-action","recall-submit"),false);
 ui.click("data-rank",rank);ui.advance(500);ui.click("data-action","recall-submit");
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
 assert.ok(ui.app.innerHTML.includes("No practice results"));
 ui.click("data-report-format","all");
 assert.ok(ui.app.innerHTML.includes("<strong>1</strong><span>Questions answered"));
 assert.equal(ui.saved().attempts.length,1);
 ui.click("data-report-format","multiple-choice");ui.click("data-practice-direction","card-number");
 assert.equal(ui.state().data.settings.answerFormat,"multiple-choice");
});
