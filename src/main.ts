
import "./style.css";
import "./dark.css";
import {
  STACK,
  isSequence,
  sequenceNeighbor,
  sequenceResult,
  type SequenceDirection,
  cardName,
  emptyData,
  choices,
  choose,
  record,
  deleteSession,
  restoreSession,
  summary,
  validate,
  key,
  type Data,
  type Direction,
  type Mode,
  type Attempt,
  type Session,
} from "./core";
import { cardImage, numberCard } from "./cards";
import { uiIcon } from "./icons";
import { sessionTrend } from "./reporting";
const app = document.querySelector<HTMLDivElement>("#app")!;
const STORE = "deckwise.v1";
let storageProblem = "";
let recoveryRaw: string | null = null;
let storageConflict = false;
let data: Data = emptyData();
try {
  const saved = localStorage.getItem(STORE);
  recoveryRaw = saved;
  if (saved) data = validate(JSON.parse(saved));
  recoveryRaw = null;
} catch {
  storageProblem =
    "Saved progress could not be loaded. Export a backup before resetting. New practice is disabled to protect it.";
}
let view: "practice" | "deck" | "progress" | "settings" = "deck",
  deckIndex = 0,
  filter = "sequence",
  period = "all",
  historyLimit = 12;
let deckMode: "browse" | "quiz" = "quiz";
let sequenceDirection: SequenceDirection = "sequence-forward";
let sequenceStart = "beginning";
let sequenceSource = 1;
let active: Session | null = null,
  sessionElapsed = 0,
  lastTick = performance.now(),
  paused = false;
let q: {
  id: string;
  position: number;
  direction: Direction;
  options: number[];
  elapsed: number;
  wrong: number;
  hint: boolean;
  revealed: boolean;
  interrupted: boolean;
  firstMs: number | null;
  firstCorrect: boolean | null;
  done: boolean;
  exposed: boolean;
  selected: number[];
} | null = null;
let recent: number[] = [],
  lastExposure = new Map<number, number>();
let galleryObserver: ResizeObserver | null = null;
let installPrompt: any = null;
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const modeName = (mode: Mode) =>
  mode === "sequence-forward" ? "Next card →" : mode === "sequence-backward" ? "← Previous card" : mode === "card-number"
    ? "Card → number"
    : mode === "number-card"
      ? "Number → card"
      : "Mixed directions";
const fmtTime = (ms: number | null) =>
  ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const runTime = (ms: number | null) => ms === null ? "—" : `${Math.floor(ms / 60000)}:${(ms / 1000 % 60).toFixed(1).padStart(4, "0")}`;
const timer = (ms: number) =>
  `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, "0")}`;
function save() {
  if (storageConflict) return false;
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
    return true;
  } catch {
    storageProblem =
      "Progress could not be saved on this device. Export a backup now; keep this page open.";
    return false;
  }
}
// A session interrupted by closing the app remains visible, with its last recorded activity.
for (const s of data.sessions)
  if (s.endedAt === null) {
    s.endedAt =
      data.attempts.filter((a) => a.sessionId === s.id).at(-1)?.at ??
      s.startedAt;
  }
function chrome(body: string) {
  app.innerHTML = `<div class="shell"><header class="header"><a href="#" class="brand" data-action="home"><img class="brand-mark" src="/brand-mark.svg" alt="" width="28" height="40"/>deckwise<span class="brand-dot">.</span></a><span class="stack-label">MNEMONICA · 52 CARDS</span><button class="icon-button" data-action="settings" aria-label="Settings">${uiIcon("settings")}</button></header>${storageProblem ? `<div class="warning" role="alert">${esc(storageProblem)} <button data-action="export">Export backup</button></div>` : ""}<main>${body}</main><nav class="nav" aria-label="Main navigation">${[
    ["deck", "Deck", "♧"],
    ["practice", "Practice", "◎"],
    ["progress", "Progress", "▥"],
    ["settings", "Settings", "⚙"],
  ]
    .map(
      ([id, label, icon]) =>
        `<button data-view="${id}" class="${view === id ? "active" : ""}" ${view === id ? 'aria-current="page"' : ""}>${uiIcon(id)}${label}</button>`,
    )
    .join("")}</nav></div>`;
  bind();
}
function render() {
  galleryObserver?.disconnect();
  galleryObserver = null;
  if (active && isSequence(active.mode)) practice();
  else if (view === "practice") practice();
  else if (view === "deck") deck();
  else if (view === "progress") progress();
  else settings();
}
function practice() {
  if (!active) {
    const associations = data.attempts.filter(a => !isSequence(a.direction));
    const s = summary(associations),
      due = Object.entries(data.memory).filter(
        ([k, m]) => !isSequence(k) && m.due <= Date.now(),
      ).length;
    chrome(
      `<section class="start-panel"><div class="segmented" aria-label="Practice direction">${(["card-number", "number-card", "mixed"] as Mode[]).map((m) => `<button data-mode="${m}" aria-pressed="${data.settings.mode === m}" class="${data.settings.mode === m ? "selected" : ""}">${modeName(m)}</button>`).join("")}</div><label class="session-length" for="minutes"><span>Session length</span><select id="minutes">${[1, 3, 5, 10].map(n => `<option value="${n}" ${data.settings.minutes === n ? "selected" : ""}>${n} minutes</option>`).join("")}</select></label><button class="primary start" data-action="start" ${storageProblem ? "disabled" : ""}>Start ${data.settings.minutes}-minute session <span>↗</span></button><div class="start-note">${associations.length ? `${due} associations due · Adaptive review` : "52 cards · 5 choices"}</div></section><div class="mini-stats"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${new Set(associations.map((a) => a.position)).size}<small>/52</small></strong><span>Cards practiced</span></div></div>`,
    );
    return;
  }
  if (!q) return;
  const stats = summary(
    data.attempts.filter((a) => a.sessionId === active!.id),
  );
  const result = q.done
    ? q.revealed
      ? "Answer revealed"
      : q.wrong
        ? "Corrected"
        : q.hint
          ? "Correct with a hint"
          : "Correct"
    : q.wrong
      ? "Incorrect. Try again."
      : q.direction === "card-number"
        ? ""
        : "";
  chrome(
    `<section class="session-top"><div><span class="eyebrow">${isSequence(q.direction) && sequenceSource === 0 ? sequenceStart === "random" ? `Choose position ${q.position}` : q.direction === "sequence-forward" ? "Choose the first card" : "Choose the last card" : modeName(q.direction)}</span>${isSequence(q.direction) ? `<span class="sequence-position">${stats.total - (data.attempts.some(a => a.id === q!.id) ? 1 : 0) + 1} / 52</span>` : ""}</div><div class="session-controls"><button class="session-timer" data-action="pause" aria-label="${paused ? "Resume" : "Pause"} practice"><span id="remaining">${active.runTarget ? runTime(sessionElapsed) : timer(active.duration - sessionElapsed)}</span><span>${paused ? "▶ Resume" : "Ⅱ Pause"}</span></button><button class="text-button end-session" data-action="finish">End session</button></div></section><div class="session-progress"><span id="session-bar" style="width:${active.runTarget ? data.attempts.filter(a => a.sessionId === active!.id && (a.id !== q?.id || q.done)).length / active.runTarget * 100 : Math.min(100, (sessionElapsed / active.duration) * 100)}%"></span></div><div class="question-stage ${paused ? "paused" : ""}"><div class="prompt-card">${isSequence(q.direction) ? sequenceSource === 0 ? "" : cardImage(sequenceSource) : q.direction === "card-number" ? cardImage(q.position) : numberCard(q.position)}</div></div><div class="feedback ${q.done ? "positive" : q.wrong ? "negative" : ""}" role="status" aria-live="polite">${paused ? "Paused" : result}</div><div class="answers" aria-label="Answer choices">${q.options.map((p, i) => `<button class="answer ${q!.selected.includes(p) && p !== q!.position ? "wrong" : ""} ${q!.done && p === q!.position ? "correct" : ""}" data-answer="${p}" aria-label="${q!.direction === "card-number" ? `Position ${p}` : cardName(p)}" ${paused || q!.done || q!.selected.includes(p) ? "disabled" : ""}>${q!.direction === "card-number" ? numberCard(p) : cardImage(p)}<span class="key-label">${i + 1}</span></button>`).join("")}</div><div class="practice-actions">${q.done ? q.revealed ? `<button class="primary next" data-action="next" ${paused ? "disabled" : ""}>Next card <span>→</span></button>` : `<span class="next-status">${paused ? "Resume to continue" : "Next card…"}</span>` : `${isSequence(q.direction) ? "" : `<button class="text-button" data-action="hint" ${paused ? "disabled" : ""}>☼ Neighbor hint</button>`}<button class="text-button" data-action="reveal" ${paused ? "disabled" : ""}>Reveal answer</button>`}</div>${q.hint && !q.done ? `<div class="hint-panel">${q.position > 1 ? `<div><span>Before</span>${cardImage(q.position - 1)}</div>` : "<span>Top of deck</span>"}${q.position < 52 ? `<div><span>After</span>${cardImage(q.position + 1)}</div>` : "<span>Bottom of deck</span>"}</div>` : ""}<div class="session-bottom"><span>${stats.total} answered · ${active.runTarget ? sequenceResult(active, data.attempts).accuracy.toFixed(0) + "% first try" : (stats.eligibleTotal ? stats.accuracy.toFixed(0) + "%" : "—") + " independent"}</span></div>`,
  );
}
function newQuestion() {
  if (active?.runTarget && q?.done && data.attempts.filter(a => a.sessionId === active!.id).length >= active.runTarget) { finish(true); return; }
  if (active && isSequence(active.mode) && q) sequenceSource = q.position;
  const direction: Direction =
    active && isSequence(active.mode) ? active.mode as SequenceDirection : data.settings.mode === "mixed"
      ? Math.random() < 0.5
        ? "card-number"
        : "number-card"
      : data.settings.mode;
  const position = isSequence(direction) ? sequenceSource === 0 ? active!.startPosition! : sequenceNeighbor(sequenceSource, direction as SequenceDirection) : choose(data, direction, recent);
  const exposed =
    recent.includes(position) ||
    Date.now() - (lastExposure.get(position) ?? 0) < 60000;
  recent.push(position);
  q = {
    id: crypto.randomUUID(),
    position,
    direction,
    options: choices(position, direction),
    elapsed: 0,
    wrong: 0,
    hint: false,
    revealed: false,
    interrupted: false,
    firstMs: null,
    firstCorrect: null,
    done: false,
    exposed,
    selected: [],
  };
  lastTick = performance.now();
  render();
}
function startSequence() {
  if (storageProblem) return;
  const startPosition = sequenceStart === "random" ? 1 + Math.floor(Math.random() * 52) : sequenceDirection === "sequence-forward" ? 1 : 52;
  sequenceSource = 0;
  start(sequenceDirection, startPosition);
}
function start(mode: Mode = data.settings.mode, startPosition = 1) {
  if (storageProblem) return;
  active = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: null,
    mode,
    duration: isSequence(mode) ? 0 : data.settings.minutes * 60000,
    ...(isSequence(mode) ? {runTarget:52, startPosition, elapsedMs:0, completed:false} : {}),
  };
  data.sessions.push(active);
  sessionElapsed = 0;
  q = null;
  recent = [];
  paused = false;
  save();
  newQuestion();
}
function persistAttempt() {
  if (!q || !active || q.firstCorrect === null) return;
  if (active.runTarget) active.elapsedMs = sessionElapsed;
  const a: Attempt = {
    id: q.id,
    sessionId: active.id,
    position: q.position,
    direction: q.direction,
    at: Date.now(),
    firstCorrect: q.firstCorrect,
    wrong: q.wrong,
    hint: q.hint,
    revealed: q.revealed,
    elapsedMs: q.interrupted ? null : q.firstMs,
    interrupted: q.interrupted,
    recentExposure: q.exposed,
  };
  const existing = data.attempts.find((x) => x.id === a.id);
  if (existing) {
    Object.assign(existing, {
      wrong: a.wrong,
      hint: a.hint,
      revealed: a.revealed,
    });
  } else record(data, a);
  save();
}
function answer(p: number) {
  if (storageConflict) return;
  if (!q || q.done || paused || q.selected.includes(p)) return;
  tick();
  if (paused || !q) return;
  q.selected.push(p);
  if (q.firstCorrect === null) {
    q.firstCorrect = p === q.position;
    q.firstMs = q.elapsed;
  }
  if (p !== q.position) q.wrong++;
  else q.done = true;
  persistAttempt();
  if (q.done) {
    lastExposure.set(q.position, Date.now());
    newQuestion();
  } else render();
}
function reveal() {
  if (!q || paused || q.done) return;
  tick();
  if (paused || !q) return;
  q.revealed = true;
  q.done = true;
  if (q.firstCorrect === null) {
    q.firstCorrect = false;
    q.firstMs = q.elapsed;
  }
  persistAttempt();
  lastExposure.set(q.position, Date.now());
  render();
}
function finish(completed = false) {
  if (!active) return;
  tick();
  const session = active;
  const id = active.id;
  filter = isSequence(active.mode) ? "sequence" : "all";
  active.endedAt = Date.now();
  if (active.runTarget) {active.elapsedMs = sessionElapsed; active.completed = completed;}
  save();
  active = null;
  q = null;
  paused = false;
  const attempts = data.attempts.filter((a) => a.sessionId === id),
    s = summary(attempts);
  render();
  if (session.runTarget) {
    showDialog(`${runResults(session)}<button class="primary" data-action="summary-progress">View progress →</button>`);
    return;
  }
  showDialog(
    `<h2>Session results</h2><p>${s.total} questions answered in ${timer(sessionElapsed)} of active practice.</p><div class="summary-grid"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${s.wrong}</strong><span>First-answer misses</span></div><div><strong>${s.hints}</strong><span>Hints used</span></div></div><p class="muted">Results saved on this device. Unanswered questions are excluded.</p><button class="primary" data-action="summary-progress">View progress →</button>`,
  );
}
function tick() {
  const now = performance.now(),
    delta = now - lastTick;
  lastTick = now;
  if (active && !paused && !document.hidden) {
    if (delta > 5000) {
      paused = true;
      if (q && q.firstCorrect === null) q.interrupted = true;
      render();
      return;
    }
    sessionElapsed += delta;
    if (q && !q.done) q.elapsed += delta;
  }
}
setInterval(() => {
  tick();
  if (!active) return;
  if (!active.runTarget && sessionElapsed >= active.duration) {
    finish();
    return;
  }
  const remain = document.querySelector("#remaining"),
    bar = document.querySelector<HTMLElement>("#session-bar");
  if (remain) remain.textContent = active.runTarget ? runTime(sessionElapsed) : timer(active.duration - sessionElapsed);
  if (bar)
    bar.style.width = `${active.runTarget ? data.attempts.filter(a => a.sessionId === active!.id && (a.id !== q?.id || q.done)).length / active.runTarget * 100 : Math.min(100, (sessionElapsed / active.duration) * 100)}%`;
}, 200);
document.addEventListener("visibilitychange", () => {
  if (active) {
    tick();
    if (document.hidden) {
      paused = true;
      if (q && q.firstCorrect === null) q.interrupted = true;
    }
    render();
  }
});
window.addEventListener("storage", (e) => {
  if (e.key !== STORE) return;
  if (active) {
    storageConflict = true;
    paused = true;
    if (q && q.firstCorrect === null) q.interrupted = true;
    storageProblem =
      "Another tab changed your progress. Reload this tab before continuing.";
  } else
    try {
      data = e.newValue ? validate(JSON.parse(e.newValue)) : emptyData();
    } catch {
      storageProblem =
        "Another tab changed your saved data. Reload before continuing.";
    }
  render();
});
function deckTabs() {
  return `<div class="segmented deck-tabs" aria-label="Deck mode"><button data-deck-mode="quiz" class="${deckMode === "quiz" ? "selected" : ""}" aria-pressed="${deckMode === "quiz"}">Sequence quiz</button><button data-deck-mode="browse" class="${deckMode === "browse" ? "selected" : ""}" aria-pressed="${deckMode === "browse"}">Browse</button></div>`;
}
function deck() {
  if (deckMode === "quiz") {
    chrome(`${deckTabs()}<section class="start-panel sequence-setup"><div class="segmented" aria-label="Sequence direction">${(["sequence-forward", "sequence-backward"] as SequenceDirection[]).map(dir => `<button data-sequence-direction="${dir}" class="${sequenceDirection === dir ? "selected" : ""}" aria-pressed="${sequenceDirection === dir}">${dir === "sequence-forward" ? "Forward →" : "← Backward"}</button>`).join("")}</div><label class="session-length">Start at<select id="sequence-start"><option value="beginning" ${sequenceStart === "beginning" ? "selected" : ""}>${sequenceDirection === "sequence-forward" ? "First card" : "Last card"}</option><option value="random" ${sequenceStart === "random" ? "selected" : ""}>Random position</option></select></label><button class="primary start" data-action="start-sequence" ${storageProblem ? "disabled" : ""}>Start full-deck run <span>→</span></button><p class="start-note">Choose the ${sequenceDirection === "sequence-forward" ? "next" : "previous"} card. 52 answers · timed run. Each wrong choice or reveal adds 5s to scored time.</p></section>`);
    return;
  }
  chrome(
    `${deckTabs()}<div class="gallery" tabindex="0" aria-label="Mnemonica deck, swipe or use arrow keys">${STACK.map((_, i) => `<article class="gallery-slide" aria-label="Position ${i + 1}, ${cardName(i + 1)}"><div class="position-pill">${i + 1}<span> / 52</span></div><div class="gallery-card">${cardImage(i + 1)}</div></article>`).join("")}</div><div class="gallery-controls"><button class="round" data-action="previous" aria-label="Previous card">←</button><span id="deck-position">${deckIndex + 1} of 52</span><button class="round" data-action="following" aria-label="Next card">→</button></div><label class="jump-label" for="jump">Jump to position <span id="jump-value">${deckIndex + 1}</span></label><input id="jump" type="range" min="1" max="52" value="${deckIndex + 1}" aria-label="Jump to deck position"/>`,
  );
  const gallery = document.querySelector<HTMLDivElement>(".gallery")!;
  gallery.scrollLeft = gallery.clientWidth * deckIndex;
  gallery.addEventListener(
    "scroll",
    () => {
      if (view !== "deck" || !gallery.isConnected) return;
      deckIndex = Math.max(
        0,
        Math.min(51, Math.round(gallery.scrollLeft / gallery.clientWidth)),
      );
      document.querySelector("#deck-position")!.textContent =
        `${deckIndex + 1} of 52`;
      document.querySelector("#jump-value")!.textContent = String(
        deckIndex + 1,
      );
      (document.querySelector("#jump") as HTMLInputElement).value = String(
        deckIndex + 1,
      );
      lastExposure.set(deckIndex + 1, Date.now());
    },
    { passive: true },
  );
  lastExposure.set(deckIndex + 1, Date.now());
  gallery.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      goDeck(deckIndex + (e.key === "ArrowRight" ? 1 : -1));
    }
  });
  galleryObserver = new ResizeObserver(() => {
    gallery.scrollTo({
      left: gallery.clientWidth * deckIndex,
      behavior: "instant",
    });
  });
  galleryObserver.observe(gallery);
}
function goDeck(index: number, instant = false) {
  deckIndex = Math.max(0, Math.min(51, index));
  const gallery = document.querySelector<HTMLDivElement>(".gallery")!;
  gallery.scrollTo({
    left: gallery.clientWidth * deckIndex,
    behavior: instant || matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
function filtered() {
  return data.attempts.filter(
    (a) =>
      (filter === "all" ? !isSequence(a.direction) : filter === "sequence" ? isSequence(a.direction) : a.direction === filter) &&
      (period === "all" || a.at >= Date.now() - Number(period) * 86400000),
  );
}
function trend(attempts: Attempt[]): string {
  const sessions = sessionTrend(data.sessions, attempts);
  if (!sessions.length) return "";
  const maxSeconds = Math.max(1, Math.ceil(Math.max(...sessions.map(s => (s.stats.medianMs ?? 0) / 1000))));
  const points = sessions.map((s,i) => ({...s, x:sessions.length === 1 ? 190 : 42 + i * 296 / (sessions.length-1)}));
  const accuracyY = (accuracy: number) => 142 - accuracy * 1.06;
  const speedY = (ms: number) => 142 - ms / 1000 / maxSeconds * 106;
  const path = (metric: "accuracy" | "speed") => {
    let gap = true;
    return points.map(p => {
      const value = metric === "accuracy" ? p.stats.eligibleTotal ? p.stats.accuracy : null : p.stats.medianMs;
      if (value === null) {gap = true; return "";}
      const point = `${gap ? "M" : "L"}${p.x},${metric === "accuracy" ? accuracyY(value) : speedY(value)}`;
      gap = false;
      return point;
    }).join(" ");
  };
  const label = (s: Session) => esc(new Date(s.startedAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}));
  return `<div class="chart session-trend"><div class="chart-title"><h2>Accuracy &amp; speed</h2><span>Last ${sessions.length} sessions</span></div><div class="trend-legend"><span class="accuracy-key">Accuracy (%)</span><span class="speed-key">Median correct (s)</span></div><svg viewBox="0 0 380 185" role="img" aria-label="Session accuracy on the left percent axis and median correct-answer time on the right seconds axis. Exact session values follow below."><text x="8" y="19" font-size="10" fill="#79b7ff">%</text><text x="350" y="19" font-size="10" fill="#d1b6ff">sec</text>${[0,50,100].map(n => `<line x1="42" x2="338" y1="${accuracyY(n)}" y2="${accuracyY(n)}" stroke="#2c3e5a" stroke-dasharray="3 4"/><text x="30" y="${accuracyY(n)+3}" text-anchor="end" font-size="10" fill="#79b7ff">${n}</text><text x="350" y="${accuracyY(n)+3}" font-size="10" fill="#d1b6ff">${Number((maxSeconds*n/100).toFixed(1))}</text>`).join("")}<path d="${path("accuracy")}" fill="none" stroke="#79b7ff" stroke-width="2.5"/><path d="${path("speed")}" fill="none" stroke="#d1b6ff" stroke-width="2.5" stroke-dasharray="5 4"/>${points.map(p => `${p.stats.eligibleTotal ? `<circle cx="${p.x}" cy="${accuracyY(p.stats.accuracy)}" r="4" fill="#79b7ff"><title>${label(p.session)}: ${p.stats.accuracy.toFixed(0)}% accuracy</title></circle>` : ""}${p.stats.medianMs !== null ? `<circle cx="${p.x}" cy="${speedY(p.stats.medianMs)}" r="4" fill="#d1b6ff"><title>${label(p.session)}: ${fmtTime(p.stats.medianMs)} median correct answer</title></circle>` : ""}`).join("")}<text x="42" y="171" font-size="10" fill="#9aabc6">Oldest</text><text x="338" y="171" text-anchor="end" font-size="10" fill="#9aabc6">Newest</text></svg><p class="muted compact trend-note">Each point is one session. Higher accuracy and fewer seconds indicate improvement.</p><details><summary>Session accuracy &amp; speed</summary><div class="table-wrap"><table><thead><tr><th>Session</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${[...sessions].reverse().map(({session,stats}) => `<tr><td>${label(session)}<br/><small>${session.duration / 60000} min · ${modeName(session.mode)}</small></td><td>${stats.total}</td><td>${stats.eligibleTotal ? stats.accuracy.toFixed(0)+"%" : "—"}</td><td>${fmtTime(stats.medianMs)}</td></tr>`).join("")}</tbody></table></div></details></div>`;
}
function runResults(session: Session) {
  const r = sequenceResult(session, data.attempts);
  return `<h2>${r.complete ? "Deck completed" : "Run ended early"}</h2><p>${modeName(session.mode)} · ${r.total}/52 answered · start position ${session.startPosition}</p><div class="summary-grid"><div><strong>${runTime(r.elapsedMs)}</strong><span>Active time</span></div><div><strong>${r.accuracy.toFixed(0)}%</strong><span>First-answer accuracy</span></div><div><strong>${runTime(r.scoredMs)}</strong><span>Scored time</span></div><div><strong>+${r.penalties * 5}s</strong><span>${r.penalties} penalties</span></div></div><p class="muted">5 seconds per wrong selection or reveal. Paused time is excluded. ${r.complete ? "Completed runs count toward personal bests." : "Partial runs do not count toward personal bests."}</p>`;
}
function sequenceBests() {
  return `<section class="report-section"><h2>Full-deck runs</h2><div class="summary-grid">${(["sequence-forward", "sequence-backward"] as SequenceDirection[]).filter(dir => filter === "sequence" || filter === dir).map(dir => {
    const runs = data.sessions.filter(s => s.mode === dir && (period === "all" || s.startedAt >= Date.now() - Number(period) * 86400000)).map(s => ({s,r:sequenceResult(s,data.attempts)})).filter(x => x.r.complete);
    const best = [...runs].sort((a,b) => a.r.scoredMs! - b.r.scoredMs!)[0];
    const latest = runs.at(-1);
    return `<div><span>${dir === "sequence-forward" ? "Forward" : "Backward"} · ${runs.length} completed</span><strong>${best ? runTime(best.r.scoredMs) : "—"}</strong><span>Best scored time</span>${best ? `<p class="muted compact">${runTime(best.r.elapsedMs)} raw · ${best.r.accuracy.toFixed(0)}% accuracy</p>` : ""}${latest ? `<p class="muted compact">Latest: ${runTime(latest.r.scoredMs)} · ${latest.r.accuracy.toFixed(0)}%</p>` : ""}</div>`;
  }).join("")} </div></section>`;
}
function sequenceTrend() {
  const runs = data.sessions.filter(s => (filter === "sequence" ? isSequence(s.mode) : s.mode === filter) && (period === "all" || s.startedAt >= Date.now() - Number(period) * 86400000))
    .map(s => ({s,r:sequenceResult(s,data.attempts)})).filter(x => x.r.complete).slice(-20);
  if (!runs.length) return '<p class="muted">Complete a full-deck run to start tracking speed and accuracy over time.</p>';
  const max = Math.max(...runs.map(x => x.r.scoredMs!), 1000);
  const point = (i: number, ms: number) => `${30 + i * 320 / Math.max(1,runs.length-1)},${125 - ms / max * 100}`;
  return `<div class="chart run-trend"><div class="chart-title"><h2>Sequence speed over time</h2><span>Last ${runs.length} completed runs</span></div><p class="muted compact">Lower is faster. Blue: raw time · light blue: scored time.</p><svg viewBox="0 0 380 160" role="img" aria-label="Raw and penalty-adjusted completion times; exact times and accuracy appear below"><line x1="30" x2="350" y1="125" y2="125" stroke="#2c3e5a"/><polyline points="${runs.map((x,i)=>point(i,x.r.elapsedMs!)).join(" ")}" fill="none" stroke="#3979cb" stroke-width="2"/><polyline points="${runs.map((x,i)=>point(i,x.r.scoredMs!)).join(" ")}" fill="none" stroke="#b3d3ff" stroke-width="2"/>${runs.map((x,i)=>`<circle cx="${point(i,x.r.scoredMs!).split(",")[0]}" cy="${point(i,x.r.scoredMs!).split(",")[1]}" r="3" fill="#b3d3ff"><title>${fmtDate(x.s.startedAt)}: ${runTime(x.r.scoredMs)} scored, ${x.r.accuracy.toFixed(0)}% accuracy</title></circle>`).join("")}<text x="30" y="150" font-size="10" fill="#9aabc6">${fmtDate(runs[0].s.startedAt)}</text><text x="310" y="150" font-size="10" fill="#9aabc6">Latest</text></svg><div class="table-wrap"><table><thead><tr><th>Run</th><th>Raw</th><th>Scored</th><th>Accuracy</th></tr></thead><tbody>${[...runs].reverse().map(({s,r})=>`<tr><td>${fmtDate(s.startedAt)}<br/><small>${s.mode === "sequence-forward" ? "Forward" : "Backward"}</small></td><td>${runTime(r.elapsedMs)}</td><td>${runTime(r.scoredMs)}</td><td>${r.accuracy.toFixed(0)}%</td></tr>`).join("")}</tbody></table></div></div>`;
}
function progress() {
  const attempts = filtered(),
    s = summary(filter.startsWith("sequence") ? attempts.map(a => ({...a,recentExposure:false})) : attempts),
    slow = attempts.filter(
      (a) =>
        a.firstCorrect &&
        !a.hint &&
        !a.revealed &&
        a.elapsedMs !== null &&
        !a.interrupted &&
        !a.recentExposure,
    ),
    within = slow.filter(
      (a) => a.elapsedMs! <= data.settings.speedTarget * 1000,
    ).length;
  const sessions = [...data.sessions]
    .reverse()
    .filter(session => (filter === "all" ? !isSequence(session.mode) : filter === "sequence" ? isSequence(session.mode) : session.mode === filter || (!isSequence(filter) && session.mode === "mixed")) &&
      (period === "all" || session.startedAt >= Date.now() - Number(period) * 86400000));
  chrome(
    `<section class="page-heading"><h1>Progress</h1></section><div class="filters"><label>Direction<select id="stats-direction"><option value="sequence" ${filter === "sequence" ? "selected" : ""}>Sequence quiz</option><option value="all" ${filter === "all" ? "selected" : ""}>Position practice</option><option value="sequence-forward" ${filter === "sequence-forward" ? "selected" : ""}>Sequence · forward</option><option value="sequence-backward" ${filter === "sequence-backward" ? "selected" : ""}>Sequence · backward</option><option value="card-number" ${filter === "card-number" ? "selected" : ""}>Card → number</option><option value="number-card" ${filter === "number-card" ? "selected" : ""}>Number → card</option></select></label><label>Period<select id="stats-period">${[
      ["all", "All time"],
      ["7", "Last 7 days"],
      ["30", "Last 30 days"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${period === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label></div><div class="summary-grid stat-cards"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${s.total}</strong><span>Questions answered</span></div><div><strong>${slow.length ? Math.round((within / slow.length) * 100) + "%" : "—"}</strong><span>Within ${data.settings.speedTarget}s target</span></div></div>${!s.total ? '<div class="empty"><span>♧</span><h2>No practice results</h2><p>Practice results will appear here, with each direction tracked separately.</p><button class="primary" data-view="practice">Go to practice →</button></div>' : `${filter.startsWith("sequence") ? sequenceTrend() : trend(attempts)}<div class="report-notes"><span>${s.wrong} first-answer misses</span><span>${s.hints} questions with hints</span><span>${new Set(attempts.map((a) => a.position)).size}/52 cards practiced</span></div>`}${filter.startsWith("sequence") ? sequenceBests() : ""}<section class="report-section"><div class="chart-title"><h2>Per-card results</h2><span>Tap a card for details</span></div><p class="muted compact">${filter === "all" ? "Results combine both directions. Filter above to find a directional weakness." : filter === "sequence" ? "Forward and backward sequence results." : modeName(filter as Direction)} Timing excludes interrupted and recently exposed answers.</p><div class="table-wrap"><table class="deck-table"><thead><tr><th>Position / card</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${STACK.map(
      (_, i) => {
        const ss = summary(attempts.filter((a) => a.position === i + 1));
        return `<tr><td><button class="card-detail" data-position="${i + 1}"><span class="position-number">${i + 1}</span><span>${cardName(i + 1)}</span></button></td><td>${ss.total || "—"}</td><td><span class="accuracy ${ss.eligibleTotal && ss.accuracy < 75 ? "low" : ""}">${ss.eligibleTotal ? ss.accuracy.toFixed(0) + "%" : "—"}</span></td><td>${fmtTime(ss.medianMs)}</td></tr>`;
      },
    ).join(
      "",
    )}</tbody></table></div></section><section class="report-section"><h2>Session history</h2>${
      sessions.length
        ? `<div class="history-list">${sessions
            .slice(0, historyLimit)
            .map((session) => {
              const ss = summary(
                attempts.filter((a) => a.sessionId === session.id),
              );
              const run = session.runTarget ? sequenceResult(session, data.attempts) : null;
              return `<div class="history-entry"><button class="history-row" data-session="${esc(session.id)}"><div><strong>${fmtDate(session.startedAt)} · ${new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong><span>${modeName(session.mode)} · ${run ? `${run.total}/52 · ${run.complete ? "complete" : "partial"}` : `${session.duration / 60000} min · ${ss.total} answered`}</span></div><div><strong>${run ? run.accuracy.toFixed(0) + "%" : ss.eligibleTotal ? ss.accuracy.toFixed(0) + "%" : "—"}</strong><span>${run ? runTime(run.scoredMs) : fmtTime(ss.medianMs)}</span></div></button><button class="delete-session" data-delete-session="${esc(session.id)}" aria-label="Delete session from ${esc(fmtDate(session.startedAt))}">${uiIcon("trash")}</button></div>`;
            })
            .join(
              "",
            )}</div>${sessions.length > historyLimit ? '<button class="text-button" data-action="more-history">Show more sessions</button>' : ""}`
        : '<p class="muted">No sessions in this period.</p>'
    }</section>${recentlyDeleted()}<div class="export-row"><button class="text-button" data-action="export">↓ Export backup</button><button class="text-button" data-action="csv">↓ Export results CSV</button></div><p class="footnote">Independent accuracy excludes recent exposure; hints and reveals count as failures. Timing also excludes interruptions. Multiple choice measures recognition; fast guesses can still be correct.</p>`,
  );
}
function recentlyDeleted() {
  const deleted = [...(data.deletedSessions ?? [])].sort((a,b) => b.deletedAt-a.deletedAt);
  if (!deleted.length) return "";
  return `<details class="report-section deleted-history" open><summary>Recently deleted (${deleted.length})</summary><p class="muted compact">Excluded from all statistics. Restore a session to include it again.</p>${deleted.map(({session, attempts}) => `<div class="history-entry"><div class="deleted-session-info"><strong>${fmtDate(session.startedAt)} · ${new Date(session.startedAt).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</strong><span>${modeName(session.mode)} · ${session.runTarget ? attempts.length + "/52" : session.duration / 60000 + " min · " + attempts.length + " answered"}</span></div><button class="secondary restore-session" data-restore-session="${esc(session.id)}">Restore</button></div>`).join("")}</details>`;
}
function confirmRestoreSession(id: string) {
  if (active || storageConflict || storageProblem) return;
  const old = data;
  const candidate = validate(JSON.parse(JSON.stringify(data)));
  const session = candidate.deletedSessions?.find(d => d.session.id === id)?.session;
  if (!session || !restoreSession(candidate,id)) return;
  data = candidate;
  if (!save()) {
    data = old;
    showDialog('<h2>Session not restored</h2><p>Storage could not be updated. The deleted session was retained for recovery.</p>');
    return;
  }
  filter = isSequence(session.mode) ? "sequence" : "all";
  period = "all";
  recent = [];
  lastExposure.clear();
  render();
}
function requestDeleteSession(id: string) {
  const session = data.sessions.find(s => s.id === id);
  if (!session || active || storageProblem) return;
  const count = data.attempts.filter(a => a.sessionId === id).length;
  showDialog(`<h2>Delete session?</h2><p>${esc(fmtDate(session.startedAt))} · ${count} answers</p><p>This excludes its answers from reports and rebuilds the review schedule. You can restore it from Recently deleted.</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">Cancel</button><button class="primary delete-confirm" data-confirm-delete="${esc(id)}">Delete session</button></div>`);
}
function confirmDeleteSession(id: string) {
  if (active || storageConflict || storageProblem) return;
  const old = data;
  const candidate = validate(JSON.parse(JSON.stringify(data)));
  if (!deleteSession(candidate, id)) return;
  data = candidate;
  if (!save()) {
    data = old;
    showDialog('<h2>Session not deleted</h2><p>Storage could not be updated. Your history was retained.</p>');
    return;
  }
  recent = [];
  lastExposure.clear();
  document.querySelector<HTMLDialogElement>('dialog')?.close();
  render();
}
function detail(position: number) {
  const attempts = filtered().filter((a) => a.position === position);
  showDialog(
    `<div class="eyebrow">POSITION ${position}</div><h2>${cardName(position)}</h2>${(
      (filter.startsWith("sequence") ? ["sequence-forward", "sequence-backward"] : ["card-number", "number-card"]) as Direction[]
    )
      .map((dir) => {
        const ss = summary(attempts.filter((a) => a.direction === dir)),
          m = data.memory[key(position, dir)];
        return `<div class="detail-direction"><h3>${modeName(dir)}</h3><p>${ss.total} answers · ${ss.eligibleTotal ? ss.accuracy.toFixed(0) + "%" : "—"} independent · ${fmtTime(ss.medianMs)} median</p><p class="muted">${m ? `Next review: ${m.due <= Date.now() ? "due now" : new Date(m.due).toLocaleString()}` : "Not practiced yet"}</p></div>`;
      })
      .join(
        "",
      )}<h3>Recent attempts</h3>${attemptList(attempts.slice(-15).reverse())}`,
  );
}
function attemptList(attempts: Attempt[]) {
  return `<div class="attempt-list">${attempts.map((a) => `<div><strong>${fmtDate(a.at)} · ${modeName(a.direction)}</strong><span>${a.revealed ? "Revealed" : a.hint ? "Assisted" : a.firstCorrect ? "Correct first try" : `${a.wrong} wrong answer${a.wrong === 1 ? "" : "s"}`} · ${fmtTime(a.elapsedMs)}${a.interrupted ? " · interrupted" : ""}${a.recentExposure ? " · recent exposure" : ""}</span></div>`).join("") || '<p class="muted">No attempts yet.</p>'}</div>`;
}
function settings() {
  chrome(
    `<section class="page-heading"><h1>Settings</h1></section><section class="settings-panel"><label>Session length<select id="minutes">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${data.settings.minutes === n ? "selected" : ""}>${n} minutes</option>`).join("")}</select></label><label>Speed target<select id="speed">${[2, 3, 5, 8, 10].map((n) => `<option value="${n}" ${data.settings.speedTarget === n ? "selected" : ""}>${n} seconds</option>`).join("")}</select></label><label class="toggle-row"><span>Use speed to adapt practice<small>Slower correct associations get extra practice.</small></span><input id="adaptive-speed" type="checkbox" ${data.settings.speedAdaptive ? "checked" : ""}/></label><p class="muted">Accuracy drives your review schedule. Timing is compared within each direction and adapts gently after enough practice.</p></section><section class="settings-panel"><h2>Data</h2><p>Saved in this browser on this device. No account, tracking, or cloud sync. Clearing browser data removes your history.</p><button class="primary" data-action="export">Export a backup ↓</button><label class="file-label">Restore from a backup<input type="file" id="import" accept="application/json,.json"/></label><p class="muted">Restore replaces this device’s progress after confirmation.</p></section><section class="settings-panel"><h2>Install Deckwise</h2><p>Install for standalone and offline use.</p><button class="primary" data-action="install">${installPrompt ? "Install app ↗" : "How to install ↗"}</button><p id="offline-status" class="muted">${navigator.onLine ? "Online" : "Offline"} · ${navigator.serviceWorker?.controller ? "Offline app ready" : "Offline setup available on the published site"}</p></section><section class="settings-panel"><h2>Reset</h2><button class="text-button danger" data-action="reset">Reset all progress</button></section><p class="footnote">Independent practice companion for Juan Tamariz’s Mnemonica. Deckwise v0.3 · <a href="https://www.me.uk/cards/" target="_blank" rel="noopener">Card artwork: Adrian Kennard (CC0)</a>.</p>`,
  );
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}
function exportBackup() {
  if (recoveryRaw !== null) {
    download("deckwise-recovery.json", recoveryRaw, "application/json");
    return;
  }
  download(
    `deckwise-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}
function csv() {
  const fields = [
    "at",
    "sessionId",
    "position",
    "card",
    "direction",
    "firstCorrect",
    "wrong",
    "hint",
    "revealed",
    "elapsedMs",
    "interrupted",
    "recentExposure",
  ];
  download(
    "deckwise-results.csv",
    [
      fields.join(","),
      ...filtered().map((a) =>
        [
          new Date(a.at).toISOString(),
          a.sessionId,
          a.position,
          cardName(a.position),
          a.direction,
          a.firstCorrect,
          a.wrong,
          a.hint,
          a.revealed,
          a.elapsedMs ?? "",
          a.interrupted,
          a.recentExposure,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\r\n"),
    "text/csv",
  );
}
function showDialog(body: string) {
  document.querySelector("dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.innerHTML = `<button class="dialog-close" aria-label="Close dialog">×</button>${body}`;
  document.body.append(dialog);
  dialog
    .querySelector(".dialog-close")!
    .addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  bind(dialog);
}
function route(next: typeof view) {
  if (active) {
    finish();
    document.querySelector("dialog")?.remove();
  }
  view = next;
  render();
  window.scrollTo(0, 0);
}
function bind(root: ParentNode = app) {
  root.querySelectorAll<HTMLElement>("[data-restore-session]").forEach(b => b.onclick = () => confirmRestoreSession(b.dataset.restoreSession!));
  root.querySelectorAll<HTMLElement>("[data-deck-mode]").forEach(b => b.onclick = () => {deckMode = b.dataset.deckMode as typeof deckMode; render();});
  root.querySelectorAll<HTMLElement>("[data-sequence-direction]").forEach(b => b.onclick = () => {sequenceDirection = b.dataset.sequenceDirection as SequenceDirection; render();});
  root.querySelector<HTMLSelectElement>("#sequence-start")?.addEventListener("change", e => {sequenceStart = (e.target as HTMLSelectElement).value;});
  root.querySelectorAll<HTMLElement>('[data-delete-session]').forEach(b =>
    b.onclick = () => requestDeleteSession(b.dataset.deleteSession!));
  root.querySelectorAll<HTMLElement>('[data-confirm-delete]').forEach(b =>
    b.onclick = () => confirmDeleteSession(b.dataset.confirmDelete!));
  root
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) => (b.onclick = () => { if (b.dataset.view === "progress") filter = "sequence"; route(b.dataset.view as typeof view); }));
  root.querySelectorAll<HTMLElement>("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        data.settings.mode = b.dataset.mode as Mode;
        save();
        render();
      }),
  );
  root
    .querySelectorAll<HTMLElement>("[data-answer]")
    .forEach((b) => (b.onclick = () => answer(Number(b.dataset.answer))));
  root
    .querySelectorAll<HTMLElement>("[data-position]")
    .forEach((b) => (b.onclick = () => detail(Number(b.dataset.position))));
  root.querySelectorAll<HTMLElement>("[data-session]").forEach(
    (b) =>
      (b.onclick = () => {
        const session = data.sessions.find((s) => s.id === b.dataset.session)!;
        showDialog(
          `<div class="eyebrow">${fmtDate(session.startedAt)}</div>${session.runTarget ? runResults(session) : `<h2>${modeName(session.mode)}</h2><p>${session.duration / 60000}-minute session</p>`}${attemptList(data.attempts.filter((a) => a.sessionId === session.id).reverse())}<button class="text-button danger" data-delete-session="${esc(session.id)}">Delete session</button>`,
        );
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-action]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        switch (b.dataset.action) {
          case "close-dialog":
            document.querySelector<HTMLDialogElement>("dialog")?.close();
            break;
          case "home":
            route("deck");
            break;
          case "settings":
            route("settings");
            break;
          case "start-sequence":
            startSequence();
            break;
          case "start":
            start();
            break;
          case "next":
            if (!paused && q?.done) newQuestion();
            break;
          case "pause":
            if (storageConflict) return;
            const resume = paused;
            tick();
            paused = !resume;
            if (active?.runTarget) {active.elapsedMs = sessionElapsed; save();}
            if (q && q.firstCorrect === null) q.interrupted = true;
            lastTick = performance.now();
            render();
            break;
          case "hint":
            if (q && !paused && !q.done) {
              tick();
              if (paused || !q) return;
              q.hint = true;
              if (q.position > 1) lastExposure.set(q.position - 1, Date.now());
              if (q.position < 52) lastExposure.set(q.position + 1, Date.now());
              persistAttempt();
              render();
            }
            break;
          case "reveal":
            reveal();
            break;
          case "finish":
            finish();
            break;
          case "previous":
            goDeck(deckIndex - 1);
            break;
          case "following":
            goDeck(deckIndex + 1);
            break;
          case "export":
            exportBackup();
            break;
          case "csv":
            csv();
            break;
          case "more-history":
            historyLimit += 20;
            render();
            break;
          case "summary-progress":
            document.querySelector<HTMLDialogElement>("dialog")?.close();
            route("progress");
            break;
          case "install":
            if (installPrompt) {
              installPrompt.prompt();
              installPrompt = null;
            } else
              showDialog(
                '<h2>Install Deckwise</h2><p><strong>iPhone / iPad:</strong> open this site in Safari, tap Share, then “Add to Home Screen.” Enable “Open as Web App” if shown.</p><p><strong>Android:</strong> open in Chrome and choose “Install app” or “Add to Home screen” from the menu.</p><p><strong>Desktop:</strong> use the install icon in Chrome or Edge’s address bar.</p><p class="muted">Visit once online and wait for “Offline app ready” before relying on offline practice.</p>',
              );
            break;
          case "reset":
            if (
              confirm(
                "Delete all Deckwise history and settings from this device? Export a backup first.",
              )
            ) {
              try {
                localStorage.removeItem(STORE);
                data = emptyData();
                recoveryRaw = null;
                storageConflict = false;
                storageProblem = "";
                render();
              } catch {
                showDialog(
                  "<h2>Reset failed</h2><p>Your browser prevented changes to storage.</p>",
                );
              }
            }
            break;
        }
      }),
  );
  root
    .querySelector<HTMLSelectElement>("#stats-direction")
    ?.addEventListener("change", (e) => {
      filter = (e.target as HTMLSelectElement).value;
      render();
    });
  root
    .querySelector<HTMLSelectElement>("#stats-period")
    ?.addEventListener("change", (e) => {
      period = (e.target as HTMLSelectElement).value;
      render();
    });
  root
    .querySelector<HTMLInputElement>("#jump")
    ?.addEventListener("input", (e) =>
      goDeck(Number((e.target as HTMLInputElement).value) - 1, true),
    );
  root
    .querySelector<HTMLSelectElement>("#minutes")
    ?.addEventListener("change", (e) => {
      data.settings.minutes = Number((e.target as HTMLSelectElement).value);
      save();
      render();
    });
  root
    .querySelector<HTMLSelectElement>("#speed")
    ?.addEventListener("change", (e) => {
      data.settings.speedTarget = Number((e.target as HTMLSelectElement).value);
      save();
    });
  root
    .querySelector<HTMLInputElement>("#adaptive-speed")
    ?.addEventListener("change", (e) => {
      data.settings.speedAdaptive = (e.target as HTMLInputElement).checked;
      save();
    });
  root
    .querySelector<HTMLInputElement>("#import")
    ?.addEventListener("change", async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.size > 20000000)
          throw Error("Backup is too large (maximum 20 MB).");
        const candidate = validate(JSON.parse(await file.text()));
        if (
          confirm(
            `Restore ${candidate.attempts.length} answers and ${candidate.sessions.length} sessions? This replaces current progress.`,
          )
        ) {
          const old = data;
          data = candidate;
          if (!save()) {
            data = old;
            throw Error(
              "The backup could not be saved. Current progress was retained.",
            );
          }
          storageProblem = "";
          render();
        }
      } catch (err) {
        showDialog(
          `<h2>Backup not restored</h2><p>${esc(err instanceof Error ? err.message : "Invalid backup.")}</p>`,
        );
      }
    });
}
document.addEventListener("keydown", (e) => {
  if (
    document.querySelector("dialog[open]") ||
    ["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)
  )
    return;
  if (active && !paused && q) {
    if (/^[1-5]$/.test(e.key)) answer(q.options[Number(e.key) - 1]);
    if (e.key === "Enter" && q.done) newQuestion();
  }
});
window.addEventListener("beforeinstallprompt", (e: any) => {
  e.preventDefault();
  installPrompt = e;
  if (view === "settings") render();
});
window.addEventListener("online", () => {
  if (view === "settings") render();
});
window.addEventListener("offline", () => {
  if (view === "settings") render();
});
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      if (view === "settings") render();
    })
    .catch(() => {
      storageProblem =
        "Offline setup did not complete. Reload while online to try again.";
      render();
    });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (view === "settings") render();
  });
}
render();
