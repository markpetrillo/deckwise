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

export function practiceEvidence(attempts: Attempt[], mode: Mode, period: "7" | "30" | "all", now = Date.now(), format?: AnswerFormat) {
  const cutoff = period === "all" ? 0 : now - Number(period) * 86400000;
  return attempts.filter(a => !isSequence(a.direction) && (mode === "mixed" || a.direction === mode) && a.at >= cutoff && (!format || formatOf(a) === format));
}

/** Full-deck records are compared only within the requested format/direction. */
export function sequenceRuns(sessions: Session[], attempts: Attempt[], direction: SequenceDirection | "sequence", format: AnswerFormat | "all", period: "7" | "30" | "all", now = Date.now()) {
  const cutoff = period === "all" ? 0 : now - Number(period) * 86400000;
  return sessions.filter(s => isSequence(s.mode) && (direction === "sequence" || s.mode === direction) && (format === "all" || formatOf(s) === format) && s.startedAt >= cutoff)
    .sort((a,b) => a.startedAt-b.startedAt)
    .map(s => ({s,r:sequenceResult(s,attempts)}))
    .filter(({r}) => r.complete);
}
