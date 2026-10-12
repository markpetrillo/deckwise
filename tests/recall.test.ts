import {test} from "node:test";
import assert from "node:assert/strict";
import {STACK, emptyData, formatOf, key, mappingModel, practiceWeights, record, updateAttempt, summary, validate, deleteSession, restoreSession, type Attempt, type AnswerFormat} from "../src/core";
import {emptyRecallInput, editRecallInput, recallPosition, recallDisplay} from "../src/recall";
import {practiceEvidence} from "../src/reporting";

const now=50*86400000;
const attempt=(format: AnswerFormat, extra: Partial<Attempt> = {}): Attempt => ({
 id:format,sessionId:format,answerFormat:format,position:31,direction:"number-card",at:now,
 firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false,...extra
});
function data() {
 const d=emptyData();
 d.sessions=(["multiple-choice","direct-recall"] as const).map(format => ({id:format,answerFormat:format,startedAt:1,endedAt:now,mode:"mixed",duration:300000}));
 return d;
}
test("direct answers cover every Mnemonica position and card without five-option cues",()=>{
 for(let position=1;position<=52;position++){
  for(const digits of [String(position),String(position).padStart(2,"0")])
   assert.equal(recallPosition("card-number",{digits,rank:"",suit:""}),position);
  const [rank,suit]=STACK[position-1];
  assert.equal(recallPosition("number-card",{digits:"",rank,suit}),position);
 }
 assert.equal(recallPosition("card-number",{digits:"07",rank:"",suit:""}),7);
 assert.equal(recallPosition("number-card",{digits:"",rank:"J",suit:"D"}),32);
});
test("partial and invalid answers are never graded as valid positions",()=>{
 const empty=emptyRecallInput();
 for(const digits of ["","0","00","53","99","007","-1","1.5"," 7","x"])
  assert.equal(recallPosition("card-number",{...empty,digits}),null);
 for(const input of [{...empty,rank:"J"},{...empty,suit:"D"},{...empty,rank:"10",suit:"D"},{...empty,rank:"J",suit:"__proto__"}])
  assert.equal(recallPosition("number-card",input),null);
 assert.equal(recallPosition("sequence-forward",{...empty,rank:"J",suit:"D"}),32);
});
test("rank and suit input edits build valid combinations without grading",()=>{
 const base=emptyRecallInput();
 const rankFirst=editRecallInput(editRecallInput(base,{type:"rank",value:"J"}),{type:"suit",value:"D"});
 const suitFirst=editRecallInput(editRecallInput(base,{type:"suit",value:"D"}),{type:"rank",value:"J"});
 assert.deepEqual(rankFirst,suitFirst);
 assert.equal(recallDisplay("number-card",rankFirst),"Jack of Diamonds");
 assert.equal(recallPosition("number-card",editRecallInput(rankFirst,{type:"rank",value:"Q"})),46);
 assert.deepEqual(base,emptyRecallInput());
});
test("touch digits allow leading zeros, backspace, clear, and at most two digits",()=>{
 let input=editRecallInput(emptyRecallInput(),{type:"digit",value:"0"});
 input=editRecallInput(input,{type:"digit",value:"7"});
 assert.equal(recallDisplay("card-number",input),"07");
 assert.equal(editRecallInput(input,{type:"digit",value:"9"}).digits,"07");
 assert.equal(editRecallInput(input,{type:"backspace"}).digits,"0");
 assert.deepEqual(editRecallInput(input,{type:"clear"}),emptyRecallInput());
 assert.equal(editRecallInput(input,{type:"digit",value:"x"}),input);
});
test("legacy backups retain their original fields and are classified as multiple choice",()=>{
 const d=emptyData();delete d.settings.answerFormat;
 d.sessions=[{id:"legacy",startedAt:1,endedAt:now,mode:"card-number",duration:300000}];
 const a=attempt("multiple-choice",{sessionId:"legacy"});delete a.answerFormat;record(d,a);
 const raw=JSON.stringify(d), restored=validate(JSON.parse(raw));
 assert.equal(JSON.stringify(restored),raw);
 assert.equal(formatOf(restored.settings),"multiple-choice");assert.equal(formatOf(restored.attempts[0]),"multiple-choice");
});
test("recall speed, mastery, and persisted intervals remain independent by answer format",()=>{
 const d=data();
 for(let i=0;i<12;i++)record(d,attempt("multiple-choice",{id:"mc"+i,at:now-1000000+i}));
 record(d,attempt("direct-recall",{firstCorrect:false,wrong:1}));
 const mc=mappingModel(d.attempts,31,"number-card",3,now,"multiple-choice");
 const direct=mappingModel(d.attempts,31,"number-card",3,now,"direct-recall");
 assert.equal(mc.category,"Automatic");assert.equal(mc.lifetime.total,12);
 assert.equal(direct.lifetime.total,1);assert.equal(direct.lifetime.accuracy,0);
 assert.equal(d.memory[key(31,"number-card")].failures,0);
 assert.equal(d.memory[key(31,"number-card","direct-recall")].failures,1);
 d.settings.answerFormat="direct-recall";
 assert.equal(practiceWeights(d,"number-card",[],now+60001).find(p=>p.position===31)!.model.lifetime.total,1);
 assert.equal(practiceWeights(d,"number-card",[],now+60001,"multiple-choice").find(p=>p.position===31)!.model.category,"Automatic");
 assert.deepEqual(validate(d),d);
});
test("direct corrections preserve first miss, first timing, and format",()=>{
 const d=data(), first=attempt("direct-recall",{firstCorrect:false,wrong:1,elapsedMs:2200,finalResult:"unresolved"});
 record(d,first);updateAttempt(d,{...first,wrong:2,finalResult:"corrected",finalElapsedMs:5000});
 assert.equal(d.attempts.length,1);assert.equal(d.attempts[0].firstCorrect,false);
 assert.equal(d.attempts[0].elapsedMs,2200);assert.equal(d.attempts[0].answerFormat,"direct-recall");
 assert.equal(summary(d.attempts).accuracy,0);assert.deepEqual(validate(d),d);
});
test("direct hints, reveals and interruptions use the established eligibility rules",()=>{
 for(const extra of [{hint:true},{revealed:true},{interrupted:true}]){
  const d=data();record(d,attempt("direct-recall",extra));
  assert.equal(summary(d.attempts).timedCount,0);
  assert.equal(summary(d.attempts).accuracy,extra.interrupted?100:0);
  assert.equal(d.memory[key(31,"number-card")],undefined);
 }
});
test("practice reports filter by format together with direction and period",()=>{
 const mc=attempt("multiple-choice",{direction:"card-number"}), direct=attempt("direct-recall",{direction:"card-number"});
 const answers=[mc,direct,attempt("direct-recall",{id:"old",at:now-8*86400000})];
 assert.deepEqual(practiceEvidence(answers,"mixed","7",now,"multiple-choice"),[mc]);
 assert.deepEqual(practiceEvidence(answers,"card-number","7",now,"direct-recall"),[direct]);
 assert.equal(practiceEvidence(answers,"mixed","all",now).length,3);
});
test("session delete and restore rebuild both formats without mixing or losing evidence",()=>{
 const d=data();record(d,attempt("multiple-choice"));record(d,attempt("direct-recall",{elapsedMs:6000}));
 const baseline=validate(d);
 assert.equal(deleteSession(d,"direct-recall"),true);assert.equal(d.attempts.length,1);
 assert.equal(d.memory[key(31,"number-card","direct-recall")],undefined);
 const restored=validate(d);assert.equal(restoreSession(restored,"direct-recall"),true);
 assert.deepEqual(restored,baseline);
});
test("damaged formats, session mismatches and invalid memory directions are rejected",()=>{
 const d=data();record(d,attempt("direct-recall"));
 assert.throws(()=>validate({...d,settings:{...d.settings,answerFormat:"bad"}}));
 assert.throws(()=>validate({...d,attempts:[{...d.attempts[0],answerFormat:"bad"}]}));
 assert.throws(()=>validate({...d,attempts:[{...d.attempts[0],answerFormat:"multiple-choice"}]}));
 assert.throws(()=>validate({...d,sessions:[{...d.sessions[1],mode:"invalid"}]}));
 assert.throws(()=>validate({...d,memory:{"direct-recall:mixed:31":d.memory[key(31,"number-card","direct-recall")]}}));
});
