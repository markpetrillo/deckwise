export type Direction = "card-number" | "number-card";
export type Mode = Direction | "mixed";
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
export const key = (position: number, direction: Direction) =>
  `${direction}:${position}`;
export interface Attempt {
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
}
export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  mode: Mode;
  duration: number;
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
  settings: {
    mode: Mode;
    minutes: number;
    speedTarget: number;
    speedAdaptive: boolean;
  };
}
export function emptyData(): Data {
  return {
    version: 1,
    attempts: [],
    sessions: [],
    memory: {},
    settings: {
      mode: "card-number",
      minutes: 5,
      speedTarget: 3,
      speedAdaptive: true,
    },
  };
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2
    ? v[Math.floor(v.length / 2)]
    : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}
export function speedLimit(data: Data, direction: Direction): number {
  const times = data.attempts
    .filter(
      (a) =>
        a.direction === direction &&
        a.firstCorrect &&
        !a.hint &&
        !a.interrupted &&
        !a.recentExposure &&
        a.elapsedMs !== null,
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
  const k = key(attempt.position, attempt.direction),
    prev = data.memory[k] ?? {
      due: 0,
      intervalDays: 0,
      successes: 0,
      failures: 0,
      slow: 0,
    };
  const independent =
    attempt.firstCorrect && !attempt.hint && !attempt.revealed;
  const slow =
    independent &&
    attempt.elapsedMs !== null &&
    data.settings.speedAdaptive &&
    attempt.elapsedMs > speedLimit(data, attempt.direction);
  const days = independent
    ? attempt.recentExposure
      ? Math.max(prev.intervalDays, 0.02)
      : Math.min(60, Math.max(1, prev.intervalDays * (slow ? 1.35 : 2)))
    : 0.02;
  data.memory[k] = {
    due: attempt.at + days * 86400000,
    intervalDays: days,
    successes:
      prev.successes + (independent && !attempt.recentExposure ? 1 : 0),
    failures: prev.failures + (!independent ? 1 : 0),
    slow: slow ? Math.min(5, prev.slow + 1) : Math.max(0, prev.slow - 1),
  };
}
export function choose(
  data: Data,
  direction: Direction,
  recent: number[],
  now = Date.now(),
  random = Math.random,
): number {
  const pool = STACK.map((_, i) => i + 1).filter(
    (p) => !recent.slice(-4).includes(p),
  );
  const weights = pool.map((p) => {
    const m = data.memory[key(p, direction)];
    if (!m) return 4;
    const recentMistakes = data.attempts
      .filter((a) => a.position === p && a.direction === direction)
      .slice(-5)
      .filter((a) => !a.firstCorrect || a.hint || a.revealed).length;
    return (
      1 +
      (m.due <= now ? 4 : 0) +
      recentMistakes * 2 +
      (data.settings.speedAdaptive ? m.slow : 0)
    );
  });
  let pick = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick < 0) return pool[i];
  }
  return pool.at(-1)!;
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
  const timed = clean.filter((a) => a.elapsedMs !== null && !a.interrupted);
  return {
    total: attempts.length,
    eligibleTotal: eligible.length,
    correct: clean.length,
    accuracy: eligible.length ? (clean.length / eligible.length) * 100 : 0,
    medianMs: median(timed.map((a) => a.elapsedMs!)),
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
    v === "card-number" || v === "number-card" || v === "mixed";
  if (
    d.version !== 1 ||
    !Array.isArray(d.attempts) ||
    !Array.isArray(d.sessions) ||
    !d.memory ||
    typeof d.memory !== "object" ||
    Array.isArray(d.memory) ||
    !d.settings ||
    !mode(d.settings.mode) ||
    !finite(d.settings.minutes) ||
    d.settings.minutes < 1 ||
    d.settings.minutes > 60 ||
    !finite(d.settings.speedTarget) ||
    d.settings.speedTarget < 1 ||
    d.settings.speedTarget > 30 ||
    typeof d.settings.speedAdaptive !== "boolean"
  )
    throw Error("Unsupported or damaged backup.");
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
      !finite(s.duration)
    )
      throw Error("Invalid session history.");
    sessionIds.add(s.id);
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
      !["card-number", "number-card"].includes(a.direction) ||
      !finite(a.at) ||
      !Number.isInteger(a.wrong) ||
      a.wrong < 0 ||
      !(a.elapsedMs === null || finite(a.elapsedMs)) ||
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
    attemptIds.add(a.id);
  }
  for (const [k, m] of Object.entries(d.memory)) {
    if (
      !/^(card-number|number-card):([1-9]|[1-4][0-9]|5[0-2])$/.test(k) ||
      !m ||
      !["due", "intervalDays", "successes", "failures", "slow"].every((f) =>
        finite((m as unknown as Record<string, unknown>)[f]),
      )
    )
      throw Error("Invalid review schedule.");
  }
  return JSON.parse(JSON.stringify(d));
}
