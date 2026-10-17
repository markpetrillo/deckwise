export type SequenceDirection = "sequence-forward" | "sequence-backward";
export type Direction = "card-number" | "number-card" | SequenceDirection;
export const isSequence = (mode: string) => mode.startsWith("sequence-");
export function sequenceNeighbor(position: number, direction: SequenceDirection): number {
  return ((position - 1 + (direction === "sequence-forward" ? 1 : -1) + 52) % 52) + 1;
}
export type Mode = Direction | "mixed";
export type AnswerFormat = "multiple-choice" | "direct-recall";
export const formatOf = (value: {answerFormat?: AnswerFormat}): AnswerFormat => value.answerFormat ?? "multiple-choice";
export const formatName = (format: AnswerFormat) => format === "direct-recall" ? "Direct recall" : "Multiple choice";
export const STACK =
  "4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H TC 5D KD 2C 3H 8D 5C KS JD 8C TS KH JC 7S TH AD 4S 7H 4D AC 9C JS QD 7C QS TD 6C AH 9D".split(
    " ",
  );
export const SUITS: Record<string, string> = {
  C: "Clubs",
  D: "Diamonds",
  H: "Hearts",
  S: "Spades",
};
export const RANKS = "A23456789TJQK";
const names: Record<string, string> = {
  A: "Ace",
  T: "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
};
export const cardName = (position: number) =>
  `${names[STACK[position - 1][0]]} of ${SUITS[STACK[position - 1][1]]}`;
export const key = (position: number, direction: Direction, format: AnswerFormat = "multiple-choice") =>
  `${format === "direct-recall" ? "direct-recall:" : ""}${direction}:${position}`;
export interface Attempt {
  answerFormat?: AnswerFormat;
  id: string;
  sessionId: string;
  position: number;
  direction: Direction;
  at: number;
  firstCorrect: boolean;
  wrong: number;
  hint: boolean;
  revealed: boolean;
  elapsedMs: number | null;
  interrupted: boolean;
  recentExposure: boolean;
  // Additive fields: absence in a v1 backup means unknown, never inferred.
  finalResult?: "correct" | "corrected" | "revealed" | "unresolved";
  finalElapsedMs?: number;
}
export interface FocusMapping {position:number; direction:Direction}
export interface FocusPlan {mappings:FocusMapping[]; target:number; elapsedMs:number; completed:boolean}
export interface Session {
  focus?: FocusPlan;
  answerFormat?: AnswerFormat;
  id: string;
  startedAt: number;
  endedAt: number | null;
  mode: Mode;
  duration: number;
  runTarget?: number;
  startPosition?: number;
  elapsedMs?: number;
  completed?: boolean;
}
export interface Memory {
  due: number;
  intervalDays: number;
  successes: number;
  failures: number;
  slow: number;
}
export interface Data {
  version: 1;
  attempts: Attempt[];
  sessions: Session[];
  memory: Record<string, Memory>;
  deletedSessions?: {session: Session; attempts: Attempt[]; deletedAt: number}[];
  settings: {
    mode: Mode;
    minutes: number;
    speedTarget: number;
    speedAdaptive: boolean;
    statsPeriod?: "7" | "30" | "all";
    answerFormat?: AnswerFormat;
    sequenceAnswerFormat?: AnswerFormat;
  };
}
export function emptyData(): Data {
  return {
    version: 1,
    attempts: [],
    sessions: [],
    memory: {},
    settings: {
      mode: "mixed",
      minutes: 5,
      speedTarget: 3,
      speedAdaptive: true,
      statsPeriod: "7",
      answerFormat: "multiple-choice",
      sequenceAnswerFormat: "multiple-choice",
    },
  };
}
export const SEQUENCE_PENALTY_MS = 5000;
export function sequenceResult(session: Session, attempts: Attempt[]) {
  const answers = attempts.filter(a => a.sessionId === session.id);
  const correct = answers.filter(a => a.firstCorrect && !a.hint && !a.revealed).length;
  const penalties = answers.reduce((sum, a) => sum + a.wrong + (a.revealed ? 1 : 0), 0);
  const elapsedMs = session.elapsedMs ?? null;
  const complete = session.runTarget === 52 && session.completed === true && answers.length === 52;
  return {total:answers.length, accuracy:answers.length ? correct / answers.length * 100 : 0, penalties,
    penaltyMs:penalties * SEQUENCE_PENALTY_MS, elapsedMs,
    scoredMs:elapsedMs === null ? null : elapsedMs + penalties * SEQUENCE_PENALTY_MS, complete};
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2
    ? v[Math.floor(v.length / 2)]
    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}
export const RECENT_WINDOW = 12;
export const MAX_RECALL_MS = 120000;
export const EXPOSURE_MS = 60000;
const DAY_MS = 86400000;
export const independent = (a: Attempt) => a.firstCorrect && !a.hint && !a.revealed;
/** Keep every observation; eligibility only controls derived speed statistics. */
export function timingEligible(a: Attempt): boolean {
  return independent(a) && !a.recentExposure && !a.interrupted &&
    a.elapsedMs !== null && Number.isFinite(a.elapsedMs) && a.elapsedMs > 0 && a.elapsedMs <= MAX_RECALL_MS;
}
export function recentlyExposed(position: number, exposures: Map<number, number>, now = Date.now()) {
  const at = exposures.get(position);
  return at !== undefined && now - at < EXPOSURE_MS;
}
export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const index = (sorted.length - 1) * fraction, low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export type RecallCategory = "Unseen" | "Building" | "Automatic" | "Fast" | "Calculated" | "Searching" | "Needs work" | "Untimed";
/** A deterministic practice cue, not a calibrated probability of remembering. */
export function mappingModel(attempts: Attempt[], position: number, direction: Direction, targetSeconds = 3, now = Date.now(), format?: AnswerFormat) {
  const history = attempts.filter(a => a.position === position && a.direction === direction && (!format || formatOf(a) === format)).sort((a,b) => a.at-b.at);
  const eligible = history.filter(a => !a.recentExposure);
  const recent = eligible.slice(-RECENT_WINDOW);
  const lifetime = summary(history), recentStats = summary(recent);
  const times = recent.filter(timingEligible).map(a => a.elapsedMs!);
  const targetMs = targetSeconds * 1000, automaticMs = targetMs / 2;
  const p75Ms = percentile(times, 0.75);
  const med = recentStats.medianMs;
  // The tail rate catches occasional searches that median and P75 can both hide.
  const lapseRate = times.length && med !== null ? times.filter(t => t > Math.max(targetMs, med * 2)).length / times.length : 0;
  const weights = recent.map((_,i) => 2 ** (-(recent.length - 1 - i) / 4));
  const weightTotal = weights.reduce((sum,w) => sum+w,0);
  const prior = lifetime.eligibleTotal ? lifetime.accuracy / 100 : 0.5;
  // As recent evidence builds, lifetime smoothing falls from two samples to
  // half a sample; old learning failures cannot prevent later automaticity.
  const priorStrength = 2 - 1.5 * Math.min(1,recent.length / 8);
  const weightedAccuracy = (recent.reduce((sum,a,i) => sum + (independent(a) ? weights[i] : 0),0) + priorStrength * prior) / (weightTotal + priorStrength);
  const confidence = Math.min(1, eligible.length / 8);
  const timingConfidence = Math.min(1, times.length / 5);
  const speedQuality = med === null ? 0.5 : Math.min(1, automaticMs / med);
  const fluency = (speedQuality * 0.8 + (p75Ms === null ? 0.5 : Math.min(1, targetMs / p75Ms)) * 0.2) * (1 - lapseRate * 0.25);
  const accuracyScore = 100 * weightedAccuracy * (0.75 + confidence * 0.25);
  const supportedFluency = 0.5 + timingConfidence * (fluency - 0.5);
  const score = eligible.length ? accuracyScore * (0.55 + supportedFluency * 0.45) : 0;
  const recentMisses = recent.filter(a => !a.firstCorrect).length;
  const recentAssists = recent.filter(a => a.hint || a.revealed).length;
  const last = eligible.at(-1), lastAttemptAt = history.at(-1)?.at ?? null;
  const lastMissAt = recent.filter(a => !a.firstCorrect).at(-1)?.at ?? null;
  const daysSinceRecall = last ? Math.max(0, now-last.at) / DAY_MS : null;
  // Recent failures taper as subsequent independent answers arrive.
  const errorHistory = history.slice(-RECENT_WINDOW);
  const errorWeights = errorHistory.map((_,i) => 2 ** (-(errorHistory.length-1-i)/4));
  const errorWeightTotal = errorWeights.reduce((sum,w) => sum+w,0);
  const errorPressure = errorWeightTotal ? errorHistory.reduce((sum,a,i) => sum + (!independent(a) ? errorWeights[i] * (a.recentExposure ? 0.5 : 1) : 0),0) / errorWeightTotal : 0;
  const automatic = recent.length >= 8 && times.length >= 5 && weightedAccuracy >= 0.9 &&
    med !== null && med <= automaticMs && p75Ms! <= automaticMs && lapseRate <= 0.1 && errorPressure <= 0.1;
  const category: RecallCategory = !eligible.length ? "Unseen" : recent.length < 4 ? "Building" :
    weightedAccuracy < 0.75 ? "Needs work" : med === null ? "Untimed" :
    automatic ? "Automatic" : med <= targetMs ? "Fast" : med <= targetMs * 2 ? "Calculated" : "Searching";
  const consistency = times.length < 5 ? "Few timed samples" : lapseRate >= 0.15 || p75Ms! > Math.max(targetMs, med! * 1.5) ? "Variable" : "Steady";
  return {position, direction, lifetime, recent:recentStats, score, accuracyScore, weightedAccuracy, confidence, timingConfidence,
    category, consistency, p75Ms, lapseRate, recentMisses, recentAssists, lastMissAt, lastAttemptAt, daysSinceRecall, errorPressure};
}
export type MappingModel = ReturnType<typeof mappingModel>;
export function mappingModels(data: Data, direction: Direction, now = Date.now(), format = formatOf(data.settings)): MappingModel[] {
  return STACK.map((_,i) => mappingModel(data.attempts,i+1,direction,data.settings.speedTarget,now,format));
}
export function speedLimit(data: Data, direction: Direction, format: AnswerFormat = "multiple-choice"): number {
  const times = data.attempts
    .filter(
      (a) => a.direction === direction && formatOf(a) === format && timingEligible(a),
    )
    .slice(-30)
    .map((a) => a.elapsedMs!);
  return Math.max(
    data.settings.speedTarget * 1000,
    times.length >= 10 ? median(times)! * 1.25 : 0,
  );
}
export function record(data: Data, attempt: Attempt): void {
  if (data.attempts.some((a) => a.id === attempt.id)) return;
  data.attempts.push(attempt);
  const k = key(attempt.position, attempt.direction, formatOf(attempt)),
    prev = data.memory[k] ?? {
      due: 0,
      intervalDays: 0,
      successes: 0,
      failures: 0,
      slow: 0,
    };
  const clean = independent(attempt);
  const slow =
    timingEligible(attempt) &&
    data.settings.speedAdaptive &&
    attempt.elapsedMs! > (isSequence(attempt.direction) ? speedLimit(data, attempt.direction,formatOf(attempt)) : data.settings.speedTarget * 1000);
  const days = clean
    ? attempt.recentExposure
      ? Math.max(prev.intervalDays, 0.02)
      : Math.min(60, Math.max(1, prev.intervalDays * (slow || (data.settings.speedAdaptive && !timingEligible(attempt)) ? 1.35 : 2)))
    : 0.02;
  data.memory[k] = {
    due: attempt.at + days * 86400000,
    intervalDays: days,
    successes:
      prev.successes + (clean && !attempt.recentExposure ? 1 : 0),
    failures: prev.failures + (!clean ? 1 : 0),
    slow: !timingEligible(attempt) ? prev.slow : slow ? Math.min(5, prev.slow + 1) : Math.max(0, prev.slow - 1),
  };
}
/** Corrections enrich raw history without regrading the first submission. */
export function updateAttempt(data: Data, attempt: Attempt): void {
  const existing = data.attempts.find(a => a.id === attempt.id);
  if (!existing) {record(data,attempt); return;}
  existing.wrong = attempt.wrong;
  existing.hint = attempt.hint;
  existing.revealed = attempt.revealed;
  existing.finalResult = attempt.finalResult;
  existing.finalElapsedMs = attempt.finalElapsedMs;
}
/** Rebuild the scheduler from currently included evidence. Deleted evidence stays out. */
function rebuildMemory(data: Data) {
  const rebuilt = emptyData();
  rebuilt.settings = {...data.settings};
  for (const a of [...data.attempts].sort((a,b) => a.at-b.at)) record(rebuilt,a);
  data.attempts = rebuilt.attempts;
  data.memory = rebuilt.memory;
}
export function deleteSession(data: Data, sessionId: string): boolean {
  const session = data.sessions.find(s => s.id === sessionId);
  if (!session || session.endedAt === null) return false;
  (data.deletedSessions ??= []).push({session, attempts:data.attempts.filter(a => a.sessionId === sessionId), deletedAt:Date.now()});
  data.sessions = data.sessions.filter(s => s.id !== sessionId);
  data.attempts = data.attempts.filter(a => a.sessionId !== sessionId);
  rebuildMemory(data);
  return true;
}
export function restoreSession(data: Data, sessionId: string): boolean {
  const deleted = data.deletedSessions?.find(d => d.session.id === sessionId);
  if (!deleted || data.sessions.some(s => s.id === sessionId) || deleted.attempts.some(a => data.attempts.some(existing => existing.id === a.id))) return false;
  data.sessions.push(deleted.session);
  data.sessions.sort((a,b) => a.startedAt-b.startedAt);
  data.attempts.push(...deleted.attempts);
  data.deletedSessions = data.deletedSessions!.filter(d => d.session.id !== sessionId);
  if (!data.deletedSessions.length) delete data.deletedSessions;
  rebuildMemory(data);
  return true;
}
export function choose(
  data: Data,
  direction: Direction,
  recent: number[],
  now = Date.now(),
  random = Math.random,
  format = formatOf(data.settings),
): number {
  const pool = practiceWeights(data,direction,recent,now,format);
  // After three deck-equivalents without a prompt, check the longest-waiting
  // mapping. The cooldown always takes precedence over coverage protection.
  const starved = pool.filter(p => p.gap >= 52 * 3).sort((a,b) => b.gap-a.gap || a.position-b.position);
  if (starved.length) return starved[0].position;
  // 15% uniform exploration, 85% adaptive draw; every eligible prompt survives.
  const total = pool.reduce((sum,p) => sum+p.weight,0);
  const probabilities = pool.map(p => 0.15 / pool.length + 0.85 * p.weight / total);
  let pick = random();
  for (let i = 0; i < pool.length; i++) {
    pick -= probabilities[i];
    if (pick < 0) return pool[i].position;
  }
  return pool.at(-1)!.position;
}
export function practiceWeights(data: Data, direction: Direction, recent: number[], now = Date.now(), format = formatOf(data.settings)) {
  const history = data.attempts.filter(a => a.direction === direction && formatOf(a) === format).sort((a,b) => a.at-b.at);
  const lastIndex = new Map<number, number>();
  history.forEach((a,i) => lastIndex.set(a.position,i));
  return mappingModels(data,direction,now,format).filter(model => !recent.slice(-4).includes(model.position)).map(model => {
    const m = data.memory[key(model.position,direction,format)];
    const gap = history.length - 1 - (lastIndex.get(model.position) ?? -1);
    const seen = model.lifetime.eligibleTotal > 0;
    const weakness = seen ? (100 - (data.settings.speedAdaptive ? model.score : model.accuracyScore)) / 100 : 0.3;
    const stale = model.daysSinceRecall === null ? 0 : Math.min(1, model.daysSinceRecall / 14);
    const uncertainty = 1-(data.settings.speedAdaptive ? Math.min(model.confidence,model.timingConfidence) : model.confidence);
    const overdue = m && m.due <= now ? 1 : 0;
    const weight = 1 + 6 * weakness + 3 * model.errorPressure + uncertainty + stale * 2 + overdue * 2 + Math.min(2, gap / 52);
    const exposed = model.lastAttemptAt !== null && now-model.lastAttemptAt < EXPOSURE_MS;
    return {position:model.position, weight:exposed ? weight * 0.25 : weight, gap, model};
  });
}
export function mixedDirection(attempts: Attempt[], random = Math.random): "card-number" | "number-card" {
  const recent = attempts.filter(a => !isSequence(a.direction)).slice(-6);
  if (recent.length === 6 && recent.every(a => a.direction === recent[0].direction))
    return recent[0].direction === "card-number" ? "number-card" : "card-number";
  return random() < 0.5 ? "card-number" : "number-card";
}
export function choices(
  position: number,
  direction: Direction,
  random = Math.random,
): number[] {
  const pool = STACK.map((_, i) => i + 1).filter((p) => p !== position);
  const result = [position];
  for (let i = 0; i < 4; i++)
    result.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return result.sort(
    direction === "card-number"
      ? (a, b) => a - b
      : (a, b) =>
          RANKS.indexOf(STACK[a - 1][0]) - RANKS.indexOf(STACK[b - 1][0]) ||
          "CDHS".indexOf(STACK[a - 1][1]) - "CDHS".indexOf(STACK[b - 1][1]),
  );
}
export function summary(attempts: Attempt[]) {
  const eligible = attempts.filter((a) => !a.recentExposure);
  const clean = eligible.filter(
    (a) => a.firstCorrect && !a.hint && !a.revealed,
  );
  const timed = clean.filter(timingEligible);
  return {
    total: attempts.length,
    eligibleTotal: eligible.length,
    correct: clean.length,
    accuracy: eligible.length ? (clean.length / eligible.length) * 100 : 0,
    medianMs: median(timed.map((a) => a.elapsedMs!)),
    timedCount: timed.length,
    timingExcluded: clean.length - timed.length,
    hints: attempts.filter((a) => a.hint).length,
    wrong: attempts.filter((a) => !a.firstCorrect).length,
    recent: attempts.filter((a) => a.recentExposure).length,
  };
}
export function validate(raw: unknown): Data {
  if (!raw || typeof raw !== "object")
    throw Error("This is not a Deckwise backup.");
  const d = raw as Data;
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
  const mode = (v: unknown) =>
    v === "card-number" || v === "number-card" || v === "mixed" || v === "sequence-forward" || v === "sequence-backward";
  if (
    d.version !== 1 ||
    !Array.isArray(d.attempts) ||
    !Array.isArray(d.sessions) ||
    !d.memory ||
    typeof d.memory !== "object" ||
    Array.isArray(d.memory) ||
    !d.settings ||
    (!mode(d.settings.mode) || isSequence(d.settings.mode)) ||
    !finite(d.settings.minutes) ||
    d.settings.minutes < 1 ||
    d.settings.minutes > 60 ||
    !finite(d.settings.speedTarget) ||
    d.settings.speedTarget < 1 ||
    d.settings.speedTarget > 30 ||
    typeof d.settings.speedAdaptive !== "boolean" ||
    (d.settings.statsPeriod !== undefined && !["7","30","all"].includes(d.settings.statsPeriod))
  )
    throw Error("Unsupported or damaged backup.");
  const validFormat = (v: unknown) => v === undefined || v === "multiple-choice" || v === "direct-recall";
  if (!validFormat(d.settings.answerFormat) || !validFormat(d.settings.sequenceAnswerFormat)) throw Error("Invalid answer format.");
  const sessionFormats = new Map<string,AnswerFormat>();
  const sessionIds = new Set<string>(),
    attemptIds = new Set<string>();
  for (const s of d.sessions) {
    if (
      !s ||
      typeof s.id !== "string" ||
      sessionIds.has(s.id) ||
      !finite(s.startedAt) ||
      !(s.endedAt === null || finite(s.endedAt)) ||
      !mode(s.mode) ||
      !finite(s.duration) ||
      !validFormat(s.answerFormat) ||
      (s.runTarget !== undefined && (!isSequence(s.mode) || s.runTarget !== 52 || !Number.isInteger(s.startPosition) || s.startPosition! < 1 || s.startPosition! > 52 || !finite(s.elapsedMs) || typeof s.completed !== "boolean"))
    )
      throw Error("Invalid session history.");
    if (s.focus !== undefined) {
      const f=s.focus;
      if (!f || s.runTarget !== undefined || !Array.isArray(f.mappings) || f.mappings.length<1 || f.mappings.length>5 ||
          f.mappings.some(m=>!m || !Number.isInteger(m.position) || m.position<1 || m.position>52 ||
            !["card-number","number-card","sequence-forward","sequence-backward"].includes(m.direction) || isSequence(m.direction)!==isSequence(s.mode)) ||
          new Set(f.mappings.map(m=>m.direction+":"+m.position)).size!==f.mappings.length ||
          f.target!==f.mappings.length*3 || !finite(f.elapsedMs) || typeof f.completed!=="boolean") throw Error("Invalid focused drill.");
    }
    sessionIds.add(s.id);
    sessionFormats.set(s.id,formatOf(s));
  }
  for (const a of d.attempts) {
    if (
      !a ||
      typeof a.id !== "string" ||
      attemptIds.has(a.id) ||
      !sessionIds.has(a.sessionId) ||
      !Number.isInteger(a.position) ||
      a.position < 1 ||
      a.position > 52 ||
      !["card-number", "number-card", "sequence-forward", "sequence-backward"].includes(a.direction) ||
      !finite(a.at) ||
      !validFormat(a.answerFormat) ||
      formatOf(a) !== sessionFormats.get(a.sessionId) ||
      !Number.isInteger(a.wrong) ||
      a.wrong < 0 ||
      !(a.elapsedMs === null || finite(a.elapsedMs)) ||
      (a.finalResult !== undefined && !["correct","corrected","revealed","unresolved"].includes(a.finalResult)) ||
      (a.finalElapsedMs !== undefined && !finite(a.finalElapsedMs)) ||
      (a.finalElapsedMs !== undefined && (a.finalResult === undefined || a.finalResult === "unresolved")) ||
      [
        "firstCorrect",
        "hint",
        "revealed",
        "interrupted",
        "recentExposure",
      ].some(
        (k) =>
          typeof (a as unknown as Record<string, unknown>)[k] !== "boolean",
      )
    )
      throw Error("Invalid attempt history.");
    const session=d.sessions.find(s=>s.id===a.sessionId)!;
    if (session.focus && !session.focus.mappings.some(m=>m.position===a.position && m.direction===a.direction)) throw Error("Answer outside focused drill.");
    attemptIds.add(a.id);
  }
  for (const [k, m] of Object.entries(d.memory)) {
    if (
      !/^(direct-recall:)?(card-number|number-card|sequence-forward|sequence-backward):([1-9]|[1-4][0-9]|5[0-2])$/.test(k) ||
      !m ||
      !["due", "intervalDays", "successes", "failures", "slow"].every((f) =>
        finite((m as unknown as Record<string, unknown>)[f]),
      )
    )
      throw Error("Invalid review schedule.");
  }
  if (d.deletedSessions !== undefined) {
    if (!Array.isArray(d.deletedSessions)) throw Error("Invalid deleted history.");
    const base = {...d, deletedSessions:undefined, sessions:[], attempts:[], memory:{}};
    for (const entry of d.deletedSessions) {
      if (!entry || !finite(entry.deletedAt) || !entry.session || entry.session.endedAt === null || !Array.isArray(entry.attempts)) throw Error("Invalid deleted history.");
      validate({...base, sessions:[entry.session], attempts:entry.attempts});
      if (sessionIds.has(entry.session.id)) throw Error("Duplicate deleted session.");
      sessionIds.add(entry.session.id);
      for (const attempt of entry.attempts) {
        if (attemptIds.has(attempt.id)) throw Error("Duplicate deleted attempt.");
        attemptIds.add(attempt.id);
      }
    }
  }
  return JSON.parse(JSON.stringify(d));
}
