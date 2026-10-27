import {formatOf,isSequence,type Direction,type Data,type Mode,type AnswerFormat,type FocusMapping} from "./core";
import {weakestMappings} from "./focus";
import {rechecks,confusionPairs} from "./learning";
import {directionComparison} from "./reporting";
const DAY=86400000;
export interface Recommendation {
 kind:"recheck"|"benchmark"|"weakest"|"confusion"|"practice"|"sequence";
 title:string;reason:string;button:string;mode:Mode;format:AnswerFormat;
 mappings?:FocusMapping[];sourceId?:string;stage?:"later"|"next-day";
}
/** Read-only, deterministic suggestions. The user always chooses whether to start. */
export function practiceRecommendation(data:Data,mode:Mode,format:AnswerFormat,now=Date.now()):Recommendation {
 const sequence=isSequence(mode);
 const directions:Direction[]=mode==="mixed"?["card-number","number-card"]:[mode];
 const evidence=data.attempts.filter(a=>formatOf(a)===format && directions.includes(a.direction));
 const eligible=evidence.filter(a=>!a.recentExposure),base={mode,format};
 const checks=rechecks(data,now).filter(r=>r.format===format && isSequence(r.mappings[0].direction)===sequence);
 const ready=checks.find(r=>r.ready);
 if(ready)return {...base,mode:isSequence(ready.mappings[0].direction)?ready.mappings[0].direction:new Set(ready.mappings.map(m=>m.direction)).size>1?"mixed":ready.mappings[0].direction,kind:"recheck",title:`Check what stuck: ${ready.mappings.length} ${ready.mappings.length===1?"mapping":"mappings"}`,button:"Start recheck",sourceId:ready.sourceId,stage:ready.stage,
  reason:`Your ${ready.stage==="later"?"30-minute":"next-day"} follow-up is ready. One answer per mapping checks recall after a delay.`};
 const intensives=data.sessions.filter(s=>s.focus && s.focus.kind!=="recheck" && s.focus.completed && s.endedAt!==null && formatOf(s)===format && isSequence(s.mode)===sequence);
 const recentlyDrilled=(mappings:FocusMapping[])=>intensives.some(s=>now-s.endedAt!<DAY && s.focus!.mappings.some(m=>mappings.some(p=>p.position===m.position && p.direction===m.direction)));
 const recentBenchmark=data.sessions.filter(s=>s.benchmark && s.mode===mode && formatOf(s)===format).sort((a,b)=>(b.endedAt??b.startedAt)-(a.endedAt??a.startedAt));
 const complete=recentBenchmark.find(s=>s.benchmark!.completed && s.endedAt!==null);
 const since=complete?.endedAt??0;
 const newGeneral=new Set(evidence.filter(a=>a.at>since).map(a=>a.sessionId));
 const generalCount=data.sessions.filter(s=>newGeneral.has(s.id)&&!s.focus&&!s.benchmark&&s.endedAt!==null).length;
 const benchmarkRest=!recentBenchmark.length || now-(recentBenchmark[0].endedAt??recentBenchmark[0].startedAt)>=DAY;
 if(!sequence && !intensives.some(s=>now-s.endedAt!<30*60000) && eligible.length>=52 && new Set(eligible.map(a=>a.position)).size>=26 && benchmarkRest &&
   (!complete || now-since>=7*DAY && eligible.filter(a=>a.at>since).length>=52 && generalCount>=3))
  return {...base,kind:"benchmark",title:complete?"Measure your progress again":"Take a balanced baseline",button:`Start ${mode==="mixed"?104:52}-prompt benchmark`,
   reason:complete?"Your last comparable benchmark is at least a week old, with more practice since. Check every mapping once to compare progress.":"You have enough practice history for a useful baseline. Cover every selected mapping once, without adaptive repeats or a time limit."};
 const pairs=confusionPairs(evidence.filter(a=>a.at>=now-7*DAY),format);
 const pair=pairs.find(p=>p.count>=3 && !recentlyDrilled(p.positions.map(position=>({position,direction:p.direction}))));
 if(pair)return {...base,kind:"confusion",mode:pair.direction,mappings:pair.positions.map(position=>({position,direction:pair.direction})),title:"Untangle a recurring mix-up",button:"Practice this pair",
  reason:`These two mappings account for ${pair.count} wrong entries in the past week. Alternate them for three turns each.`};
 const weakest=weakestMappings(evidence,directions,format,data.settings.speedTarget,now,data.settings.focusSize??5);
 const needsWork=weakest.some(m=>m.model.recent.eligibleTotal>=4 && (m.model.weightedAccuracy<0.85 && (m.model.recentMisses>=2 || m.model.recentAssists>=2) || m.model.recent.medianMs!==null && m.model.recent.medianMs>data.settings.speedTarget*1000 || m.model.consistency==="Variable"));
 if(needsWork && !recentlyDrilled(weakest)){
  const misses=weakest.filter(m=>m.model.weightedAccuracy<0.85 && (m.model.recentMisses>=2 || m.model.recentAssists>=2)).length;
  return {...base,kind:"weakest",mappings:weakest.map(({position,direction})=>({position,direction})),title:`Strengthen your weakest ${weakest.length}`,button:`Drill weakest ${weakest.length}`,
   reason:misses?`${misses} selected mappings have lower recent accuracy. Three spaced turns each give them focused practice.`:`The selected mappings are slow or inconsistent against your ${data.settings.speedTarget}s target. Give each three spaced turns.`};
 }
 if(sequence){
  const opposite=mode==="sequence-forward"?"sequence-backward":"sequence-forward";
  const runs=data.sessions.filter(s=>s.runTarget===52&&s.completed&&formatOf(s)===format);
  if(runs.some(s=>s.mode===mode)&&!runs.some(s=>s.mode===opposite))return {...base,kind:"sequence",mode:opposite,title:`Try a ${opposite==="sequence-backward"?"backward":"forward"} run`,button:`Start ${opposite==="sequence-backward"?"backward":"forward"} run`,reason:"You have a complete run in one direction, but no complete run in the other using this format. Build both sequence skills."};
  return {...base,kind:"sequence",title:"Build fluent sequence recall",button:"Start sequence run",reason:checks.length?"Your delayed recheck is not ready yet. A full run gives you broader practice in the meantime.":"Run the whole stack in your selected direction. Accuracy comes first; aim for smoother recall as it settles."};
 }
 const comparison=mode==="mixed"?directionComparison(data.attempts.filter(a=>formatOf(a)===format && a.at>=now-30*DAY)):null;
 if(comparison?.focus)return {...base,kind:"practice",mode:comparison.focus,title:`Focus on ${comparison.focus==="card-number"?"Card → number":"Number → card"}`,button:"Start adaptive practice",
  reason:comparison.reason==="speed"?`On shared cards, median recall is ${(comparison.speedGapMs!/1000).toFixed(1)}s slower. Adaptive practice will mix weak mappings with broader checks.`:`On shared cards, independent accuracy is ${comparison.accuracyGap.toFixed(0)} percentage points lower. Give that direction some extra practice.`};
 return {...base,kind:"practice",title:eligible.length<20?"Build your recall picture":"Keep recall broad",button:"Start adaptive practice",
  reason:checks.length?"Your delayed recheck is not ready yet. Practice a broader mix instead of immediately repeating the same drill.":eligible.length<20?"Start with a normal session so Deckwise can learn which mappings are accurate, slow or unfamiliar.":"Adaptive practice balances weaker mappings, spaced reviews and occasional checks of stronger ones."};
}
