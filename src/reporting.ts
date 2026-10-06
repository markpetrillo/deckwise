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
