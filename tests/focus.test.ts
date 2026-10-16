import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyData,validate,deleteSession,restoreSession,sequenceResult,type Attempt,type Session,type Direction,type AnswerFormat} from "../src/core";
import {weakestMappings,focusPrompt} from "../src/focus";
import {sequenceRuns} from "../src/reporting";
const now=50*86400000;
function answer(position:number,direction:Direction="number-card",format:AnswerFormat="direct-recall",correct=true,ms=1000):Attempt {
 return {id:direction+format+position,sessionId:"history",position,direction,answerFormat:format,at:now-600000,firstCorrect:correct,wrong:correct?0:1,hint:false,revealed:false,elapsedMs:ms,interrupted:false,recentExposure:false,finalResult:correct?"correct":"corrected"};
}
test("weakest five isolate formats and directions and exclude unobserved mappings",()=>{
 const attempts=[answer(1,"number-card","direct-recall",false),answer(2,"number-card","direct-recall",true,8000),
  answer(3),answer(4,"card-number","direct-recall",false),answer(5,"number-card","multiple-choice",false)];
 const picks=weakestMappings(attempts,["number-card"],"direct-recall",3,now);
 assert.deepEqual(picks.map(p=>p.position),[1,2,3]);
 assert.ok(picks.every(p=>p.direction==="number-card"));
 assert.deepEqual(weakestMappings(attempts,["number-card"],"multiple-choice",3,now).map(p=>p.position),[5]);
 assert.deepEqual(weakestMappings([],["number-card"],"direct-recall",3,now),[]);
});
test("focused mapping cycles preserve separate skills and give all five three spaced turns",()=>{
 const mappings=Array.from({length:5},(_,i)=>({position:i+1,direction:"card-number" as const}));
 const plan={mappings,target:15,elapsedMs:0,completed:false};
 const sequence=Array.from({length:15},(_,i)=>focusPrompt(plan,i));
 assert.deepEqual(sequence.slice(0,5),mappings);assert.deepEqual(sequence.slice(5,10),mappings);
 for(let p=1;p<=5;p++)assert.equal(sequence.filter(m=>m.position===p).length,3);
});
test("focused sessions survive backups and recoverable deletion without qualifying as full-deck bests",()=>{
 const d=emptyData();
 const s:Session={id:"drill",mode:"sequence-forward",answerFormat:"direct-recall",startedAt:now-3000,endedAt:now,duration:0,
  focus:{mappings:[{position:1,direction:"sequence-forward"},{position:2,direction:"sequence-backward"}],target:6,elapsedMs:3000,completed:true}};
 d.sessions=[s];d.attempts=Array.from({length:6},(_,i)=>({...answer(i%2+1,i%2?"sequence-backward":"sequence-forward"),id:"a"+i,sessionId:"drill"}));
 assert.deepEqual(validate(d),d);assert.equal(sequenceResult(s,d.attempts).complete,false);
 assert.deepEqual(sequenceRuns(d.sessions,d.attempts,"sequence","direct-recall","all",now),[]);
 assert.equal(deleteSession(d,"drill"),true);assert.equal(restoreSession(d,"drill"),true);assert.deepEqual(validate(d),d);
});
test("malformed focus plans and answers outside the selected mappings are rejected",()=>{
 const d=emptyData();d.sessions=[{id:"drill",mode:"card-number",answerFormat:"direct-recall",startedAt:now,endedAt:null,duration:0,
  focus:{mappings:[{position:1,direction:"card-number"}],target:3,elapsedMs:0,completed:false}}];
 assert.deepEqual(validate(d),d);
 const mutations=[(x:any)=>x.sessions[0].focus.target=52,(x:any)=>x.sessions[0].focus.mappings=[],
  (x:any)=>x.sessions[0].focus.mappings[0].direction="sequence-forward",(x:any)=>x.sessions[0].focus.elapsedMs=-1,
  (x:any)=>x.attempts=[{...answer(2,"card-number"),sessionId:"drill"}]];
 for(const change of mutations){const bad=structuredClone(d);change(bad);assert.throws(()=>validate(bad));}
});
