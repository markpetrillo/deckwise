import {test} from "node:test";
import assert from "node:assert/strict";
import {STACK,emptyData,record,key,validate,deleteSession,restoreSession,sequenceResult,speedLimit,type Session,type Attempt,type AnswerFormat,type SequenceDirection} from "../src/core";
import {recallPosition,emptyRecallInput} from "../src/recall";
import {sequenceRuns} from "../src/reporting";
const DAY=86400000,now=50*DAY;
function run(id:string,format:AnswerFormat,direction:SequenceDirection="sequence-forward",at=now-1000,ms=52000):Session {
 return {id,answerFormat:format,mode:direction,startedAt:at,endedAt:at+ms,duration:0,runTarget:52,startPosition:1,elapsedMs:ms,completed:true};
}
function answers(s:Session):Attempt[] {
 return Array.from({length:52},(_,i)=>({id:s.id+"-"+i,sessionId:s.id,answerFormat:s.answerFormat,position:i+1,direction:s.mode as SequenceDirection,
  at:s.startedAt+i*1000,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false,finalResult:"correct"}));
}
test("sequence direct entry supports all 52 card answers in both directions",()=>{
 for(const direction of ["sequence-forward","sequence-backward"] as const)
  for(let i=0;i<52;i++)assert.equal(recallPosition(direction,{...emptyRecallInput(),rank:STACK[i][0],suit:STACK[i][1]}),i+1);
});
test("sequence format backup fields and memory survive while position skills stay independent",()=>{
 const d=emptyData();d.settings.sequenceAnswerFormat="direct-recall";
 const s=run("direct","direct-recall","sequence-backward");d.sessions=[s];answers(s).forEach(a=>record(d,a));
 assert.deepEqual(validate(d),d);
 assert.equal(d.memory[key(1,"sequence-backward","direct-recall")].successes,1);
 assert.equal(d.memory[key(1,"sequence-backward")],undefined);
 assert.equal(d.memory[key(1,"number-card","direct-recall")],undefined);
 assert.equal(deleteSession(d,"direct"),true);const restored=validate(d);assert.equal(restoreSession(restored,"direct"),true);
 assert.deepEqual(restored.attempts,d.deletedSessions![0].attempts);
 assert.equal(sequenceResult(restored.sessions[0],restored.attempts).complete,true);
});
test("direct sequence run scoring preserves raw time, first misses, reveals and 5-second penalties",()=>{
 const s=run("direct","direct-recall"),a=answers(s);
 a[0]={...a[0],firstCorrect:false,wrong:2,finalResult:"corrected"};
 a[1]={...a[1],firstCorrect:false,revealed:true,finalResult:"revealed"};
 const r=sequenceResult(s,a);assert.equal(r.elapsedMs,52000);assert.equal(r.penalties,3);
 assert.equal(r.scoredMs,67000);assert.equal(r.accuracy,50/52*100);assert.equal(r.complete,true);
 assert.equal(sequenceRuns([s],a,"sequence","direct-recall","all",now).length,1);
 assert.equal(sequenceRuns([{...s,completed:false}],a,"sequence","direct-recall","all",now).length,0);
});
test("full-deck reports separate formats, directions, date windows and legacy records",()=>{
 const mc=run("mc","multiple-choice","sequence-forward",now-1000,20000);delete mc.answerFormat;
 const direct=run("direct","direct-recall","sequence-forward",now-900,40000);
 const back=run("back","direct-recall","sequence-backward",now-800,45000);
 const old=run("old","direct-recall","sequence-forward",now-8*DAY);
 const partial={...run("partial","direct-recall"),completed:false};
 const sessions=[back,mc,direct,old,partial],a=sessions.flatMap(answers);
 assert.deepEqual(sequenceRuns(sessions,a,"sequence-forward","multiple-choice","7",now).map(x=>x.s.id),["mc"]);
 assert.deepEqual(sequenceRuns(sessions,a,"sequence-forward","direct-recall","7",now).map(x=>x.s.id),["direct"]);
 assert.deepEqual(sequenceRuns(sessions,a,"sequence-backward","direct-recall","7",now).map(x=>x.s.id),["back"]);
 assert.equal(sequenceRuns(sessions,a,"sequence","all","all",now).length,4);
 const boundary=run("edge","direct-recall","sequence-forward",now-7*DAY);
 assert.equal(sequenceRuns([boundary],answers(boundary),"sequence","direct-recall","7",now).length,1);
});
test("sequence fluency comparisons do not mix input formats",()=>{
 const d=emptyData(),mc=run("mc","multiple-choice"),direct=run("direct","direct-recall");
 d.sessions=[mc,direct];
 answers(mc).slice(0,12).forEach(a=>record(d,{...a,elapsedMs:9000}));
 answers(direct).slice(0,12).forEach(a=>record(d,a));
 assert.equal(speedLimit(d,"sequence-forward","multiple-choice"),11250);
 assert.equal(speedLimit(d,"sequence-forward","direct-recall"),3000);
});
test("legacy sequence backups keep unknown optional fields untouched",()=>{
 const d=emptyData();delete d.settings.sequenceAnswerFormat;
 const s=run("legacy","multiple-choice");delete s.answerFormat;d.sessions=[s];
 d.attempts=answers(s).map(a=>{delete a.answerFormat;delete a.finalResult;return a;});
 const raw=JSON.stringify(d);assert.equal(JSON.stringify(validate(JSON.parse(raw))),raw);
 assert.throws(()=>validate({...d,settings:{...d.settings,sequenceAnswerFormat:"bad"}}));
});
