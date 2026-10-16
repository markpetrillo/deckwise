import {formatOf,mappingModel,type Attempt,type Direction,type AnswerFormat,type FocusPlan} from "./core";
/** Each mapping is scored independently within one answer format. */
export function weakestMappings(attempts:Attempt[],directions:Direction[],format:AnswerFormat,target=3,now=Date.now(),limit=5) {
 const evidence=attempts.filter(a=>formatOf(a)===format);
 return directions.flatMap(direction=>Array.from({length:52},(_,i)=>{
  const position=i+1,model=mappingModel(evidence,position,direction,target,now);
  return {position,direction,model};
 })).filter(m=>m.model.lifetime.eligibleTotal>0)
  .sort((a,b)=>a.model.score-b.model.score||b.model.errorPressure-a.model.errorPressure||a.position-b.position||a.direction.localeCompare(b.direction))
  .slice(0,limit);
}
/** A fixed cycle gives every selected mapping three turns before completion. */
export function focusPrompt(plan:FocusPlan,completed:number) {
 return plan.mappings[completed%plan.mappings.length];
}
