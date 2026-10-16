import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyData,type Data} from "../src/core";
import {emptyRecallInput} from "../src/recall";
import {defaultUiState,restoreUiState,loadUiState,type UiState} from "../src/ui-state";

function live(): {data:Data; state:UiState} {
 const data=emptyData();
 data.sessions=[{id:"run",mode:"sequence-forward",answerFormat:"direct-recall",startedAt:1000,endedAt:null,duration:0,runTarget:52,startPosition:1,elapsedMs:0,completed:false}];
 const state=defaultUiState(data);
 state.resume={sessionId:"run",elapsed:800,source:0,recent:[1],exposures:[],savedAt:1800,
  question:{id:"q",answerFormat:"direct-recall",input:emptyRecallInput(),position:1,direction:"sequence-forward",options:[],
    elapsed:800,wrong:0,lastIncorrect:"",hint:false,revealed:false,interrupted:false,firstMs:null,firstCorrect:null,done:false,exposed:false,selected:[]}};
 return {data,state};
}
test("missing and malformed UI preferences use defaults without changing history",()=>{
 const d=emptyData(),before=structuredClone(d);
 for(const input of [undefined,null,[],{version:2,view:"progress"},"bad"])
  assert.deepEqual(restoreUiState(input,d),defaultUiState(d));
 assert.deepEqual(d,before);
});
test("UI fields recover independently and reject invalid values",()=>{
 const d=emptyData(),state=restoreUiState({version:1,view:"progress",deckMode:"browse",deckIndex:99,
  filter:"card-number",positionFilter:"number-card",sequenceFilter:"sequence-backward",reportFormat:"all",
  sequenceReportFormat:"invalid",cardSort:"mastery",sequenceStart:"random",historyLimit:-1,scrollY:Infinity},d);
 assert.equal(state.view,"progress");assert.equal(state.deckMode,"browse");assert.equal(state.deckIndex,0);
 assert.equal(state.filter,"card-number");assert.equal(state.positionFilter,"number-card");assert.equal(state.sequenceFilter,"sequence-backward");
 assert.equal(state.reportFormat,"all");assert.equal(state.sequenceReportFormat,"multiple-choice");assert.equal(state.cardSort,"mastery");
 assert.equal(state.historyLimit,12);assert.equal(state.scrollY,0);
});
test("blocked or corrupted tab storage falls back to ordinary saved UI preferences",()=>{
 const d=emptyData(),saved={...defaultUiState(d),view:"settings"};
 for(const first of [()=>{throw Error("blocked");},()=>"{broken",()=>JSON.stringify({version:2})])
  assert.equal(loadUiState(d,[first,()=>JSON.stringify(saved)]).view,"settings");
 assert.equal(loadUiState(d,[()=>{throw Error("blocked");}]).view,"practice");
});
test("quiz checkpoint recovery checks session, format, input and sequence position",()=>{
 const {data,state}=live();assert.deepEqual(restoreUiState(state,data).resume,state.resume);
 const cases=[(x:any)=>x.resume.question.position=2,(x:any)=>x.resume.source=52,
  (x:any)=>x.resume.question.answerFormat="multiple-choice",(x:any)=>x.resume.question.input.digits="123",
  (x:any)=>x.resume.question.input.rank="Z",(x:any)=>x.resume.question.selected=[32],
  (x:any)=>x.resume.question.elapsed=900,(x:any)=>x.resume.exposures=[[99,1000]],
  (x:any)=>x.resume.question.options=[1],(x:any)=>x.resume.question.firstCorrect=false];
 for(const change of cases){const bad=structuredClone(state);change(bad);assert.equal(restoreUiState(bad,data).resume,undefined);}
 assert.equal(restoreUiState(state,emptyData()).resume,undefined);
 data.sessions[0].endedAt=2000;assert.equal(restoreUiState(state,data).resume,undefined);
});
test("stale recovery cannot overwrite a stored miss or its timing",()=>{
 const {data,state}=live(),q=state.resume!.question;
 Object.assign(q,{firstCorrect:false,firstMs:300,wrong:1,selected:[32],lastIncorrect:"Jack of Diamonds"});
 data.attempts=[{id:"q",sessionId:"run",position:1,direction:"sequence-forward",answerFormat:"direct-recall",at:1300,
  firstCorrect:false,wrong:1,hint:false,revealed:false,elapsedMs:300,interrupted:false,recentExposure:false,finalResult:"unresolved"}];
 assert.ok(restoreUiState(state,data).resume);
 const before=structuredClone(data);
 for(const field of ["wrong","firstMs","firstCorrect","hint","revealed"] as const) {
  const bad=structuredClone(state),target:any=bad.resume!.question;
  target[field]=typeof target[field]==="boolean"?!target[field]:2;
  assert.equal(restoreUiState(bad,data).resume,undefined);
 }
 assert.deepEqual(data,before);
});
