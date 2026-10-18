import {isSequence, summary, mappingModel, STACK, type MappingModel, type Session, type Attempt, type Mode, type AnswerFormat, type SequenceDirection, sequenceResult, formatOf} from "./core";
/** Attempts arrive already filtered by practice direction and reporting period. */
export function sessionTrend(sessions: Session[], attempts: Attempt[], limit = 20) {
  const grouped = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const group = grouped.get(a.sessionId) ?? [];
    group.push(a);
    grouped.set(a.sessionId, group);
  }
  return sessions.filter(s => !isSequence(s.mode) && grouped.has(s.id))
    .sort((a,b) => a.startedAt-b.startedAt)
    .slice(-limit)
    .map(session => ({session, stats:summary(grouped.get(session.id)!)}));
}

export const TREND_WINDOW = 100;
export const TREND_MIN_ANSWERS = 20;
export const TREND_MIN_MAPPINGS = 10;
export const TREND_MIN_TIMED = 5;
/** Daily snapshots of general practice, independent of session length or count.
 * Call with evidence already scoped to the selected report window/direction.
 * Each format remains a separate series; focused drills never enter the window.
 */
export function progressTrend(sessions:Session[], attempts:Attempt[], format:AnswerFormat, limit=30) {
  const generalIds=new Set(sessions.filter(s=>!isSequence(s.mode) && !s.focus).map(s=>s.id));
  const evidence=attempts.filter(a=>generalIds.has(a.sessionId) && !isSequence(a.direction) && !a.recentExposure && formatOf(a)===format)
    .sort((a,b)=>a.at-b.at || a.id.localeCompare(b.id));
  const days=new Map<string,Attempt[]>();
  for(const a of evidence) {
    const date=new Date(a.at),day=[date.getFullYear(),date.getMonth()+1,date.getDate()].join("-");
    const group=days.get(day) ?? [];group.push(a);days.set(day,group);
  }
  const window:Attempt[]=[];
  const points:{at:number;from:number;mappings:number;stats:ReturnType<typeof summary>}[]=[];
  for(const group of days.values()) {
    // Slice per day rather than spread the entire history into a function call.
    for(const a of group) {window.push(a);if(window.length>TREND_WINDOW)window.shift();}
    const mappings=new Set(window.map(a=>a.direction+":"+a.position)).size;
    if(window.length<TREND_MIN_ANSWERS || mappings<TREND_MIN_MAPPINGS)continue;
    const stats=summary(window);
    points.push({at:window.at(-1)!.at,from:window[0].at,mappings,
      stats:{...stats,medianMs:stats.timedCount>=TREND_MIN_TIMED?stats.medianMs:null}});
  }
  return {format,count:evidence.length,mappings:new Set(evidence.map(a=>a.direction+":"+a.position)).size,points:points.slice(-limit)};
}

export function directionComparison(attempts: Attempt[]) {
  const recent = (direction: "card-number" | "number-card") => attempts.filter(a => a.direction === direction && !a.recentExposure).sort((a,b) => a.at-b.at).slice(-100);
  const card = recent("card-number"), number = recent("number-card");
  const common = new Set(card.map(a => a.position).filter(p => number.some(a => a.position === p)));
  const matchedCard = card.filter(a => common.has(a.position)), matchedNumber = number.filter(a => common.has(a.position));
  const c = summary(matchedCard), n = summary(matchedNumber);
  const enough = common.size >= 10 && matchedCard.length >= 20 && matchedNumber.length >= 20 && new Set(matchedCard.map(a => a.sessionId)).size >= 2 && new Set(matchedNumber.map(a => a.sessionId)).size >= 2;
  const timedCount = (list: Attempt[]) => summary(list).timedCount;
  let focus: "card-number" | "number-card" | null = null;
  let reason: "insufficient" | "accuracy" | "speed" | "tradeoff" | "balanced" = "insufficient";
  const accuracyGap = Math.abs(c.accuracy-n.accuracy);
  const speedGapMs = c.medianMs === null || n.medianMs === null ? null : Math.abs(c.medianMs-n.medianMs);
  if (enough) {
    reason = "balanced";
    if (accuracyGap >= 10) {focus = c.accuracy < n.accuracy ? "card-number" : "number-card"; reason = "accuracy";}
    else if (timedCount(matchedCard) >= 10 && timedCount(matchedNumber) >= 10 && c.medianMs !== null && n.medianMs !== null && speedGapMs! >= 1000 && Math.max(c.medianMs,n.medianMs) >= Math.min(c.medianMs,n.medianMs)*1.25) {
      const slowerCard = c.medianMs > n.medianMs;
      const slowerMoreAccurate = slowerCard ? c.accuracy-n.accuracy >= 5 : n.accuracy-c.accuracy >= 5;
      if (slowerMoreAccurate) reason = "tradeoff";
      else {focus = slowerCard ? "card-number" : "number-card"; reason = "speed";}
    }
  }
  return {card:summary(card), number:summary(number), cardCount:card.length, numberCount:number.length, commonCards:common.size, focus, reason, accuracyGap, speedGapMs};
}

export type CardSort = "position" | "mastery" | "speed" | "accuracy" | "misses";
export function cardRanking(attempts: Attempt[], direction: "all" | "card-number" | "number-card", target = 3, sort: CardSort = "position", now = Date.now()) {
  const dirs = direction === "all" ? ["card-number", "number-card"] as const : [direction];
  const value = (m: MappingModel) => sort === "speed" ? -(m.recent.medianMs ?? -1) :
    sort === "accuracy" ? m.weightedAccuracy : sort === "misses" ? -(m.lastMissAt ?? -1) : m.score;
  const rows = STACK.map((_,i) => {
    const models = dirs.map(dir => mappingModel(attempts,i+1,dir,target,now));
    // A combined report ranks the weakest observed direction; no combined skill.
    const observed = models.filter(m => m.lifetime.eligibleTotal);
    const weakest = [...(observed.length ? observed : models)].sort((a,b) => value(a)-value(b))[0];
    return {position:i+1, models, weakest, stats:summary(attempts.filter(a => a.position === i+1 && (direction === "all" || a.direction === direction)))};
  });
  return rows.sort((a,b) => sort === "position" ? a.position-b.position :
    Number(!a.weakest.lifetime.eligibleTotal)-Number(!b.weakest.lifetime.eligibleTotal) ||
    value(a.weakest)-value(b.weakest) || a.position-b.position);
}

export function mappingInsights(attempts: Attempt[], target = 3, direction: "card-number" | "number-card" | null = null) {
  const directions = direction ? [direction] : ["card-number", "number-card"] as const;
  const models = directions.flatMap(dir => STACK.map((_,i) => mappingModel(attempts,i+1,dir,target)));
  const slowMappings = models.filter(m => m.recent.eligibleTotal >= 4 && m.recent.timedCount >= 3 && m.weightedAccuracy >= 0.75 && m.recent.medianMs! > target*1000).length;
  const variableMappings = models.filter(m => m.consistency === "Variable").length;
  const recent = [...attempts].filter(a => !isSequence(a.direction) && !a.recentExposure && (!direction || a.direction === direction)).sort((a,b) => a.at-b.at).slice(-100);
  const misses = recent.filter(a => !a.firstCorrect);
  const counts = new Map<string,number>();
  misses.forEach(a => {const k = `${a.direction}:${a.position}`; counts.set(k,(counts.get(k) ?? 0)+1);});
  let concentratedMappings = 0, covered = 0;
  for (const count of [...counts.values()].sort((a,b) => b-a)) {
    if (covered >= misses.length * 0.7) break;
    concentratedMappings++; covered += count;
  }
  return {slowMappings, variableMappings, recentMisses:misses.length, concentratedMappings, coveredMisses:covered};
}

type ReportPeriod = "7" | "30" | "all";
type ReportDirection = "all" | "sequence" | Attempt["direction"];
const periodCutoff = (period:ReportPeriod,now:number) => period === "all" ? 0 : now-Number(period)*86400000;
/** Rolling windows share one rule across reports and position-practice summaries. */
export function reportEvidence(attempts:Attempt[], direction:ReportDirection, format:AnswerFormat|"all", period:ReportPeriod, now=Date.now()) {
  const cutoff=periodCutoff(period,now);
  return attempts.filter(a=>(direction === "all" ? !isSequence(a.direction) : direction === "sequence" ? isSequence(a.direction) : a.direction === direction) &&
    (format === "all" || formatOf(a) === format) && a.at >= cutoff);
}
export function practiceEvidence(attempts: Attempt[], mode: Mode, period: ReportPeriod, now = Date.now(), format?: AnswerFormat) {
  return reportEvidence(attempts,mode === "mixed" ? "all" : mode,format ?? "all",period,now);
}

/** Full-deck records are compared only within the requested format/direction. */
export function sequenceRuns(sessions: Session[], attempts: Attempt[], direction: SequenceDirection | "sequence", format: AnswerFormat | "all", period: "7" | "30" | "all", now = Date.now()) {
  const cutoff = periodCutoff(period,now);
  return sessions.filter(s => isSequence(s.mode) && (direction === "sequence" || s.mode === direction) && (format === "all" || formatOf(s) === format) && s.startedAt >= cutoff)
    .sort((a,b) => a.startedAt-b.startedAt)
    .map(s => ({s,r:sequenceResult(s,attempts)}))
    .filter(({r}) => r.complete);
}
