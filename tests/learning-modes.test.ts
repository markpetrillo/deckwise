import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyData,validate,record,deleteSession,restoreSession,type Data,type Session,type Attempt,type FocusMapping} from "../src/core";
import {benchmarkMappings,rechecks,confusionPairs,confusionMappings,RECHECK_LATER_MS,RECHECK_NEXT_DAY_MS} from "../src/learning";
const now=50*86400000;
function drill(id='source',endedAt=now,mappings:FocusMapping[]=Array.from({length:6},(_,i)=>({position:i+1,direction:'card-number'}))):Session {
 return {id,startedAt:endedAt-60000,endedAt,mode:'card-number',duration:0,answerFormat:'direct-recall',focus:{mappings,target:mappings.length*3,elapsedMs:60000,completed:true}};
}
function answered(session:Session,position=1,direction:'card-number'|'number-card'='card-number'):Attempt {
 return {id:session.id+'-'+position+'-'+direction,sessionId:session.id,position,direction,answerFormat:'direct-recall',at:session.startedAt+1000,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false};
}
test('benchmarks cover exactly 52 or 104 unique mappings and space inverse prompts by 52',()=>{
 for(const mode of ['card-number','number-card','mixed'] as const){
  const plan=benchmarkMappings(mode,()=>0.31);assert.equal(plan.length,mode==='mixed'?104:52);
  assert.equal(new Set(plan.map(m=>m.direction+':'+m.position)).size,plan.length);
  assert.equal(new Set(plan.slice(0,52).map(m=>m.position)).size,52);
  if(mode==='mixed')for(let i=0;i<52;i++){assert.equal(plan[i].position,plan[i+52].position);assert.notEqual(plan[i].direction,plan[i+52].direction);}
 }
 assert.throws(()=>benchmarkMappings('sequence-backward'));
});
test('benchmark backups validate complete order, reject damaged plans, and survive recoverable deletion',()=>{
 const d=emptyData(),s:Session={id:'bench',startedAt:now,endedAt:now+104000,mode:'mixed',duration:0,answerFormat:'direct-recall',benchmark:{mappings:benchmarkMappings('mixed',()=>0.2),elapsedMs:104000,completed:true}};
 d.sessions=[s];d.attempts=s.benchmark!.mappings.map((m,i)=>({...answered(s,m.position,m.direction as 'card-number'|'number-card'),at:now+i*1000}));
 assert.deepEqual(validate(structuredClone(d)),d);
 const malformed=structuredClone(d);malformed.sessions[0].benchmark!.mappings[1]=malformed.sessions[0].benchmark!.mappings[0];assert.throws(()=>validate(malformed));
 const reversed=structuredClone(d);reversed.attempts.reverse();assert.throws(()=>validate(reversed));
 const incomplete=structuredClone(d);incomplete.attempts.pop();assert.throws(()=>validate(incomplete));
 assert.equal(deleteSession(d,s.id),true);assert.deepEqual(validate(structuredClone(d)),d);assert.equal(restoreSession(d,s.id),true);assert.equal(d.attempts.length,104);
});
test('rechecks unlock after 30 minutes and the next day, with one completed pass per stage',()=>{
 const d=emptyData(),s=drill();d.sessions=[s];
 assert.equal(rechecks(d,now)[0].ready,false);assert.equal(rechecks(d,now+RECHECK_LATER_MS-1)[0].ready,false);
 const ready=rechecks(d,now+RECHECK_LATER_MS)[0];assert.equal(ready.ready,true);assert.equal(ready.stage,'later');
 d.sessions.push({...drill('check',now+RECHECK_LATER_MS+6000,s.focus!.mappings),focus:{...s.focus!,kind:'recheck',passes:1,target:6,sourceSessionId:s.id,recheckStage:'later'}});
 const next=rechecks(d,now+RECHECK_LATER_MS+6000)[0];assert.equal(next.stage,'next-day');assert.equal(next.ready,false);
 assert.equal(rechecks(d,now+RECHECK_NEXT_DAY_MS)[0].ready,true);
 d.sessions.push({...drill('next',now+RECHECK_NEXT_DAY_MS+6000,s.focus!.mappings),focus:{...s.focus!,kind:'recheck',passes:1,target:6,sourceSessionId:s.id,recheckStage:'next-day'}});
 assert.equal(rechecks(d,now+RECHECK_NEXT_DAY_MS+6000).length,0);
});
test('pending checks use newest mapping ownership, keep formats separate, skip missed first stages and expire without deleting history',()=>{
 const d=emptyData(),old=drill('old',now-3600000),fresh=drill('fresh',now,[{position:1,direction:'card-number'}]);
 const mc={...drill('mc',now),answerFormat:'multiple-choice' as const};d.sessions=[old,fresh,mc];
 const queue=rechecks(d,now+RECHECK_LATER_MS);assert.equal(queue.find(r=>r.sourceId==='old')!.mappings.some(m=>m.position===1),false);
 assert.equal(queue.find(r=>r.sourceId==='fresh')!.mappings.length,1);assert.equal(queue.find(r=>r.sourceId==='mc')!.mappings.length,6);
 assert.equal(rechecks(d,now+2*86400000).every(r=>r.stage==='next-day'),true);
 assert.equal(rechecks(d,now+8*86400000).length,0);assert.equal(d.sessions.length,3);
});
test('wrong submissions retain corrected answers, derive symmetric confusion pairs, and reject invalid payloads',()=>{
 const d=emptyData(),s:Session={...drill('general'),focus:undefined,duration:60000};delete s.focus;d.sessions=[s];
 const a=answered(s,1);a.firstCorrect=false;a.wrong=1;a.finalResult='corrected';a.finalElapsedMs=2000;a.submissions=[{position:7,at:a.at,elapsedMs:1000},{position:1,at:a.at+1000,elapsedMs:2000}];record(d,a);
 const b={...answered(s,7),id:'inverse',firstCorrect:false,wrong:1,submissions:[{position:1,at:now,elapsedMs:1000}]};record(d,b);
 assert.deepEqual(validate(structuredClone(d)),d);
 const pairs=confusionPairs(d.attempts,'direct-recall');assert.equal(pairs.length,1);assert.equal(pairs[0].count,2);assert.deepEqual(pairs[0].positions,[1,7]);
 assert.equal(confusionPairs(d.attempts,'multiple-choice').length,0);assert.equal(confusionMappings(pairs).length,2);
 const bad=structuredClone(d);bad.attempts[0].submissions![0].position=53;assert.throws(()=>validate(bad));
 const altered=structuredClone(d);altered.attempts[0].submissions!.pop();altered.attempts[0].firstCorrect=true;assert.throws(()=>validate(altered));
 const legacy=structuredClone(d);delete legacy.attempts[0].submissions;delete legacy.attempts[1].submissions;assert.deepEqual(validate(legacy),legacy);assert.equal(confusionPairs(legacy.attempts,'direct-recall').length,0);
 assert.equal(deleteSession(d,s.id),true);assert.deepEqual(validate(structuredClone(d)),d);assert.equal(restoreSession(d,s.id),true);assert.equal(confusionPairs(d.attempts,'direct-recall')[0].count,2);
});
test('configurable focus sizes and recheck metadata are additive and safely validated',()=>{
 for(const size of [5,6,8] as const){const d=emptyData();d.settings.focusSize=size;d.sessions=[drill('s',now,Array.from({length:size},(_,i)=>({position:i+1,direction:'card-number'})))];assert.deepEqual(validate(d),d);}
 const d=emptyData();d.sessions=[drill()];d.sessions[0].focus!.passes=1;assert.throws(()=>validate(d));
 d.sessions[0].focus!.kind='recheck';d.sessions[0].focus!.target=6;d.sessions[0].focus!.sourceSessionId='legacy-deleted-source';d.sessions[0].focus!.recheckStage='later';assert.deepEqual(validate(d),d);
});