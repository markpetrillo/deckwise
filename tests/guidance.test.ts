import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyData,type Data,type Attempt,type Direction,type Session} from "../src/core";
import {practiceRecommendation} from "../src/guidance";
import {benchmarkMappings} from "../src/learning";
const DAY=86400000,now=200*DAY;
function add(d:Data,id:string,count:number,positions=52,at=now-3600000,dir:Direction="card-number",ms=2000){
 d.sessions.push({id,mode:dir,answerFormat:"direct-recall",startedAt:at,endedAt:at+count*1000,duration:60000});
 const answers:Attempt[]=Array.from({length:count},(_,i)=>({id:id+i,sessionId:id,position:i%positions+1,direction:dir,answerFormat:"direct-recall",at:at+i*1000,elapsedMs:ms,firstCorrect:true,wrong:0,hint:false,revealed:false,interrupted:false,recentExposure:false}));
 d.attempts.push(...answers);return answers;
}
function intensive(d:Data,age=20*60000){
 const s:Session={id:"drill",mode:"card-number",answerFormat:"direct-recall",startedAt:now-age-10000,endedAt:now-age,duration:0,
 focus:{mappings:[{position:1,direction:"card-number"}],target:3,elapsedMs:10000,completed:true}};
 d.sessions.push(s);return s;
}
test('guidance starts with broad practice and never mutates history or preferences',()=>{
 const d=emptyData(),before=structuredClone(d),r=practiceRecommendation(d,"mixed","direct-recall",now);
 assert.equal(r.kind,"practice");assert.match(r.reason,/learn which mappings/);assert.deepEqual(d,before);
 const a=add(d,"mc",60);a.forEach(x=>x.answerFormat="multiple-choice");d.sessions[0].answerFormat="multiple-choice";
 assert.equal(practiceRecommendation(d,"mixed","direct-recall",now).kind,"practice");
 assert.equal(practiceRecommendation(d,"number-card","multiple-choice",now).kind,"practice");
});
test('a ready delayed recheck wins over drills and benchmarks and accurately identifies its direction',()=>{
 const d=emptyData();add(d,"general",104);intensive(d,3600000);
 const r=practiceRecommendation(d,"mixed","direct-recall",now);assert.equal(r.kind,"recheck");assert.equal(r.sourceId,"drill");assert.equal(r.mode,"card-number");assert.equal(r.stage,"later");
 assert.notEqual(practiceRecommendation(d,"sequence-forward","direct-recall",now).kind,"recheck");
 assert.notEqual(practiceRecommendation(d,"mixed","multiple-choice",now).kind,"recheck");
});
test('a first balanced baseline needs coverage and is not prescribed immediately after an intensive drill',()=>{
 const d=emptyData();add(d,"general",52,26);
 assert.equal(practiceRecommendation(d,"mixed","direct-recall",now).kind,"benchmark");
 assert.match(practiceRecommendation(d,"mixed","direct-recall",now).button,/104/);
 assert.match(practiceRecommendation(d,"card-number","direct-recall",now).button,/52/);
 const narrow=emptyData();add(narrow,"narrow",100,1);assert.notEqual(practiceRecommendation(narrow,"mixed","direct-recall",now).kind,"benchmark");
 intensive(d);assert.equal(practiceRecommendation(d,"mixed","direct-recall",now).kind,"practice");
});
test('repeat benchmarks require a week, enough new eligible answers and three broad sessions; partial attempts get a day off',()=>{
 const d=emptyData(),at=now-8*DAY,plan=benchmarkMappings("card-number",()=>0.2);
 const s:Session={id:"baseline",mode:"card-number",answerFormat:"direct-recall",startedAt:at,endedAt:at+52000,duration:0,benchmark:{mappings:plan,elapsedMs:52000,completed:true}};
 add(d,"baseline",52,52,at);d.sessions[0]=s;
 add(d,"broad1",26,26);add(d,"broad2",26,26);
 assert.notEqual(practiceRecommendation(d,"card-number","direct-recall",now).kind,"benchmark");
 add(d,"broad3",26,26);assert.equal(practiceRecommendation(d,"card-number","direct-recall",now).kind,"benchmark");
 s.endedAt=now-6*DAY;assert.notEqual(practiceRecommendation(d,"card-number","direct-recall",now).kind,"benchmark");
 s.benchmark!.completed=false;s.endedAt=now-3600000;assert.notEqual(practiceRecommendation(d,"card-number","direct-recall",now).kind,"benchmark");
});
test('weakest suggestions need supported recent difficulty and avoid hammering the same mappings after a drill',()=>{
 const d=emptyData();add(d,"slow",4,1,now-3600000,"card-number",7000);
 const r=practiceRecommendation(d,"card-number","direct-recall",now);assert.equal(r.kind,"weakest");assert.equal(r.mappings!.length,1);assert.match(r.reason,/slow or inconsistent/);
 intensive(d);const next=practiceRecommendation(d,"card-number","direct-recall",now);assert.equal(next.kind,"practice");assert.match(next.reason,/not ready yet/);
 const sparse=emptyData();add(sparse,"one",1,1,now-3600000,"card-number",10000);assert.equal(practiceRecommendation(sparse,"card-number","direct-recall",now).kind,"practice");
});
test('recurring recent recorded confusions can earn a targeted pair suggestion and old guesses cannot',()=>{
 const d=emptyData(),a=add(d,"mixups",3,1);
 a.forEach(x=>{x.firstCorrect=false;x.wrong=1;x.submissions=[{position:2,at:x.at,elapsedMs:2000}];});
 const r=practiceRecommendation(d,"card-number","direct-recall",now);assert.equal(r.kind,"confusion");assert.deepEqual(r.mappings?.map(m=>m.position),[1,2]);
 a.forEach(x=>delete x.submissions);assert.notEqual(practiceRecommendation(d,"card-number","direct-recall",now).kind,"confusion");
});
test('a completed sequence direction can introduce the untried opposite direction without treating it as random access',()=>{
 const d=emptyData();add(d,"forward",52,52,now-DAY,"sequence-forward");Object.assign(d.sessions[0],{runTarget:52,completed:true,startPosition:1,elapsedMs:52000});
 const r=practiceRecommendation(d,"sequence-forward","direct-recall",now);assert.equal(r.kind,"sequence");assert.equal(r.mode,"sequence-backward");assert.match(r.title,/backward/);
 assert.equal(practiceRecommendation(d,"sequence-forward","multiple-choice",now).mode,"sequence-forward");
});

test('recent regression can trigger a drill despite extensive old success, while one slip alone does not',()=>{
 const d=emptyData();add(d,"old",100,1,now-30*DAY,"card-number",1000);
 const recent=add(d,"regression",1,1,now-3600000,"card-number",1000);recent.forEach(a=>{a.firstCorrect=false;a.wrong=1;});
 assert.notEqual(practiceRecommendation(d,"card-number","direct-recall",now).kind,"weakest");
 add(d,"regression2",3,1,now-1800000,"card-number",1000).forEach(a=>{a.firstCorrect=false;a.wrong=1;});
 assert.equal(practiceRecommendation(d,"card-number","direct-recall",now).kind,"weakest");
});
test('after recent targeted practice, a supported direction gap can guide broader practice',()=>{
 const d=emptyData();for(const id of ['card1','card2'])add(d,id,20,10,now-3600000,'card-number',6000);
 for(const id of ['number1','number2'])add(d,id,20,10,now-3600000,'number-card',2000);
 intensive(d);const r=practiceRecommendation(d,'mixed','direct-recall',now);
 assert.equal(r.kind,'practice');assert.equal(r.mode,'card-number');assert.match(r.reason,/4.0s slower/);
});
