import {isSequence, summary, type Session, type Attempt} from "./core";
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
  const timedCount = (list: Attempt[]) => list.filter(a => a.firstCorrect && !a.hint && !a.revealed && !a.interrupted && a.elapsedMs !== null).length;
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
