import {formatOf,isSequence,STACK,type Data,type Session,type Attempt,type AnswerFormat,type Mode,type Direction,type FocusMapping} from "./core";
export const RECHECK_LATER_MS=30*60000,RECHECK_NEXT_DAY_MS=24*3600000,RECHECK_EXPIRY_MS=7*86400000;
const mappingKey=(m:FocusMapping)=>m.direction+":"+m.position;
/** Each mapping belongs to its newest completed intensive drill, per format. */
export function rechecks(data:Data,now=Date.now()) {
 const sources=data.sessions.filter(s=>s.focus && s.focus.kind!=="recheck" && s.focus.completed && s.endedAt!==null && now-s.endedAt<RECHECK_EXPIRY_MS).sort((a,b)=>a.endedAt!-b.endedAt!);
 const owners=new Map<string,string>();
 for(const s of sources)for(const m of s.focus!.mappings)owners.set(formatOf(s)+":"+mappingKey(m),s.id);
 return sources.flatMap(source=>{
  const firstDone=data.sessions.some(s=>s.focus?.kind==="recheck" && s.focus.completed && s.focus.sourceSessionId===source.id && s.focus.recheckStage==="later");
  const age=now-source.endedAt!,stage=age>=RECHECK_NEXT_DAY_MS || firstDone?"next-day" as const:"later" as const;
  const completed=new Set(data.sessions.filter(s=>s.focus?.kind==="recheck" && s.focus.completed && s.focus.sourceSessionId===source.id && s.focus.recheckStage===stage).flatMap(s=>s.focus!.mappings.map(mappingKey)));
  const mappings=source.focus!.mappings.filter(m=>owners.get(formatOf(source)+":"+mappingKey(m))===source.id && !completed.has(mappingKey(m)));
  if(!mappings.length)return [];
  const chosenStage=stage;
  const due=source.endedAt!+(chosenStage==="later"?RECHECK_LATER_MS:RECHECK_NEXT_DAY_MS);
  return [{sourceId:source.id,format:formatOf(source),mappings,stage:chosenStage as "later"|"next-day",due,ready:now>=due}];
 }).sort((a,b)=>a.due-b.due || a.sourceId.localeCompare(b.sourceId));
}
/** Random order, no repeated position within a pass. Mixed reverses each skill in pass two. */
export function benchmarkMappings(mode:Mode,random=Math.random):FocusMapping[] {
 if(isSequence(mode))throw Error("Benchmarks use random-access directions.");
 const positions=STACK.map((_,i)=>i+1);
 for(let i=positions.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]];}
 const first=positions.map(position=>({position,direction:mode==="mixed"?(random()<0.5?"card-number":"number-card"):mode as Direction}));
 return mode==="mixed"?[...first,...first.map(m=>({...m,direction:m.direction==="card-number"?"number-card" as const:"card-number" as const}))]:first;
}
/** Pair counts are derived only from recorded wrong submissions; legacy guesses stay unknown. */
export function confusionPairs(attempts:Attempt[],format:AnswerFormat) {
 const pairs=new Map<string,{positions:[number,number];direction:Direction;count:number;lastAt:number}>();
 for(const a of attempts.filter(a=>formatOf(a)===format))for(const s of a.submissions??[]){
  if(s.position===a.position)continue;
  const positions=[a.position,s.position].sort((x,y)=>x-y) as [number,number],key=a.direction+":"+positions.join(":");
  const pair=pairs.get(key)??{positions,direction:a.direction,count:0,lastAt:0};
  pair.count++;pair.lastAt=Math.max(pair.lastAt,s.at);pairs.set(key,pair);
 }
 return [...pairs.values()].sort((a,b)=>b.count-a.count || b.lastAt-a.lastAt || a.positions[0]-b.positions[0] || a.positions[1]-b.positions[1]);
}
export function confusionMappings(pairs:ReturnType<typeof confusionPairs>,limit=8):FocusMapping[] {
 const mappings=new Map<string,FocusMapping>();
 for(const pair of pairs)for(const position of pair.positions){const m={position,direction:pair.direction};if(mappings.size<limit)mappings.set(mappingKey(m),m);}
 return [...mappings.values()];
}
export function benchmarkResult(session:Session,attempts:Attempt[]) {
 const answers=attempts.filter(a=>a.sessionId===session.id);
 return {total:answers.length,target:session.benchmark?.mappings.length??0,complete:session.benchmark?.completed===true && answers.length===session.benchmark.mappings.length};
}