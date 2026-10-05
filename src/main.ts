import "./style.css";
import {
  STACK,
  cardName,
  emptyData,
  choices,
  choose,
  record,
  summary,
  validate,
  key,
  type Data,
  type Direction,
  type Mode,
  type Attempt,
  type Session,
} from "./core";
import { cardSvg, numberCard } from "./cards";
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
let view: "practice" | "deck" | "progress" | "settings" = "practice",
  deckIndex = 0,
  filter = "all",
  period = "all",
  historyLimit = 12;
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
  mode === "card-number"
    ? "Card → number"
    : mode === "number-card"
      ? "Number → card"
      : "Mixed directions";
const fmtTime = (ms: number | null) =>
  ms === null ? "—" : `${(ms / 1000).toFixed(1)}s`;
const fmtDate = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  app.innerHTML = `<div class="shell"><header class="header"><a href="#" class="brand" data-action="home"><span class="brand-mark">♠</span>deckwise<span class="brand-dot">.</span></a><span class="stack-label">MNEMONICA · 52 CARDS</span><button class="icon-button" data-action="settings" aria-label="Settings">⚙</button></header>${storageProblem ? `<div class="warning" role="alert">${esc(storageProblem)} <button data-action="export">Export backup</button></div>` : ""}<main>${body}</main><nav class="nav" aria-label="Main navigation">${[
    ["practice", "Practice", "◎"],
    ["deck", "The deck", "♧"],
    ["progress", "Progress", "▥"],
  ]
    .map(
      ([id, label, icon]) =>
        `<button data-view="${id}" class="${view === id ? "active" : ""}" ${view === id ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</button>`,
    )
    .join("")}</nav></div>`;
  bind();
}
function render() {
  galleryObserver?.disconnect();
  galleryObserver = null;
  if (view === "practice") practice();
  else if (view === "deck") deck();
  else if (view === "progress") progress();
  else settings();
}
function practice() {
  if (!active) {
    const s = summary(data.attempts),
      due = Object.values(data.memory).filter(
        (m) => m.due <= Date.now(),
      ).length;
    chrome(
      `<section class="intro"><div class="eyebrow">A LITTLE PRACTICE, EVERY DAY</div><h1>Make the stack<br>second nature.</h1><p>Five minutes toward faster recall.</p></section><div class="welcome-stage"><div class="ghost-card left">${cardSvg(21)}</div><div class="hero-card">${cardSvg(22)}</div><div class="ghost-card right">${cardSvg(23)}</div></div><section class="start-panel"><div class="segmented" aria-label="Practice direction">${(["card-number", "number-card", "mixed"] as Mode[]).map((m) => `<button data-mode="${m}" aria-pressed="${data.settings.mode === m}" class="${data.settings.mode === m ? "selected" : ""}">${modeName(m)}</button>`).join("")}</div><button class="primary start" data-action="start" ${storageProblem ? "disabled" : ""}>Start ${data.settings.minutes}-minute practice <span>↗</span></button><div class="start-note">${data.attempts.length ? `${due} associations due · Weak cards return more often` : "Full deck · Five choices · Adapts as you practice"}</div></section><div class="mini-stats"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${new Set(data.attempts.map((a) => a.position)).size}<small>/52</small></strong><span>Cards practiced</span></div></div>`,
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
        ? "Corrected — we’ll revisit this"
        : q.hint
          ? "Correct with a hint"
          : "Correct. Nicely recalled."
    : q.wrong
      ? "Not quite. Try another card."
      : q.direction === "card-number"
        ? "What position is this card?"
        : "Which card is at this position?";
  chrome(
    `<section class="session-top"><div><span class="eyebrow">${modeName(q.direction)}</span><h1 class="small-heading">${paused ? "Practice paused" : "Find the association."}</h1></div><button class="session-timer" data-action="pause" aria-label="${paused ? "Resume" : "Pause"} practice"><span id="remaining">${timer(active.duration - sessionElapsed)}</span><span>${paused ? "▶ Resume" : "Ⅱ Pause"}</span></button></section><div class="session-progress"><span id="session-bar" style="width:${Math.min(100, (sessionElapsed / active.duration) * 100)}%"></span></div><div class="question-stage ${paused ? "paused" : ""}"><div class="prompt-card">${q.direction === "card-number" ? cardSvg(q.position) : numberCard(q.position)}</div><div class="prompt-caption">${q.direction === "card-number" ? cardName(q.position) : `Position ${q.position}`}</div></div><div class="feedback ${q.done ? "positive" : q.wrong ? "negative" : ""}" role="status" aria-live="polite">${paused ? "Resume when you’re ready." : result}</div><div class="answers" aria-label="Answer choices">${q.options.map((p, i) => `<button class="answer ${q!.selected.includes(p) && p !== q!.position ? "wrong" : ""} ${q!.done && p === q!.position ? "correct" : ""}" data-answer="${p}" aria-label="${q!.direction === "card-number" ? `Position ${p}` : cardName(p)}" ${paused || q!.done || q!.selected.includes(p) ? "disabled" : ""}>${q!.direction === "card-number" ? numberCard(p) : cardSvg(p)}<span class="key-label">${i + 1}</span></button>`).join("")}</div><div class="practice-actions">${q.done ? `<button class="primary next" data-action="next" ${paused ? "disabled" : ""}>Next card <span>→</span></button>` : `<button class="text-button" data-action="hint" ${paused ? "disabled" : ""}>☼ Neighbor hint</button><button class="text-button" data-action="reveal" ${paused ? "disabled" : ""}>Reveal answer</button>`}</div>${q.hint && !q.done ? `<div class="hint-panel">${q.position > 1 ? `<div><span>Before</span>${cardSvg(q.position - 1)}</div>` : "<span>Top of deck</span>"}${q.position < 52 ? `<div><span>After</span>${cardSvg(q.position + 1)}</div>` : "<span>Bottom of deck</span>"}</div>` : ""}<div class="session-bottom"><span>${stats.total} answered · ${stats.eligibleTotal ? stats.accuracy.toFixed(0) + "%" : "—"} independent</span><button class="text-button" data-action="finish">Finish session</button></div>`,
  );
}
function newQuestion() {
  const direction: Direction =
    data.settings.mode === "mixed"
      ? Math.random() < 0.5
        ? "card-number"
        : "number-card"
      : data.settings.mode;
  const position = choose(data, direction, recent);
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
function start() {
  if (storageProblem) return;
  active = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: null,
    mode: data.settings.mode,
    duration: data.settings.minutes * 60000,
  };
  data.sessions.push(active);
  sessionElapsed = 0;
  recent = [];
  paused = false;
  save();
  newQuestion();
}
function persistAttempt() {
  if (!q || !active || q.firstCorrect === null) return;
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
  q.selected.push(p);
  if (q.firstCorrect === null) {
    q.firstCorrect = p === q.position;
    q.firstMs = q.elapsed;
  }
  if (p !== q.position) q.wrong++;
  else q.done = true;
  persistAttempt();
  if (q.done) lastExposure.set(q.position, Date.now());
  render();
}
function reveal() {
  if (!q || paused || q.done) return;
  tick();
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
function finish() {
  if (!active) return;
  tick();
  const id = active.id;
  active.endedAt = Date.now();
  save();
  active = null;
  q = null;
  paused = false;
  const attempts = data.attempts.filter((a) => a.sessionId === id),
    s = summary(attempts);
  render();
  showDialog(
    `<div class="eyebrow">SESSION COMPLETE</div><h2>A little more fluent.</h2><p>${s.total} questions answered in ${timer(sessionElapsed)} of active practice.</p><div class="summary-grid"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${s.wrong}</strong><span>First-answer misses</span></div><div><strong>${s.hints}</strong><span>Hints used</span></div></div><p class="muted">${s.wrong ? "Missed associations will return sooner." : "Spaced practice builds evidence over time."} Your session is saved on this device.</p><button class="primary" data-action="summary-progress">View progress →</button>`,
  );
}
function tick() {
  const now = performance.now(),
    delta = now - lastTick;
  lastTick = now;
  if (active && !paused && !document.hidden) {
    if (delta > 5000) {
      paused = true;
      if (q) q.interrupted = true;
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
  if (sessionElapsed >= active.duration) {
    finish();
    return;
  }
  const remain = document.querySelector("#remaining"),
    bar = document.querySelector<HTMLElement>("#session-bar");
  if (remain) remain.textContent = timer(active.duration - sessionElapsed);
  if (bar)
    bar.style.width = `${Math.min(100, (sessionElapsed / active.duration) * 100)}%`;
}, 200);
document.addEventListener("visibilitychange", () => {
  if (active) {
    tick();
    if (document.hidden) {
      paused = true;
      if (q && !q.done) q.interrupted = true;
    }
    render();
  }
});
window.addEventListener("storage", (e) => {
  if (e.key !== STORE) return;
  if (active) {
    storageConflict = true;
    paused = true;
    if (q) q.interrupted = true;
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
function deck() {
  chrome(
    `<section class="page-heading"><div class="eyebrow">THE TAMARIZ STACK</div><h1>Meet your deck.</h1><p>Swipe through all 52 cards, top to bottom.</p></section><div class="gallery" tabindex="0" aria-label="Mnemonica deck, swipe or use arrow keys">${STACK.map((_, i) => `<article class="gallery-slide" aria-label="Position ${i + 1}, ${cardName(i + 1)}"><div class="position-pill">${i + 1}<span> / 52</span></div><div class="gallery-card">${cardSvg(i + 1)}</div><h2>${cardName(i + 1)}</h2></article>`).join("")}</div><div class="gallery-controls"><button class="round" data-action="previous" aria-label="Previous card">←</button><span id="deck-position">${deckIndex + 1} of 52</span><button class="round" data-action="following" aria-label="Next card">→</button></div><label class="jump-label" for="jump">Jump to position <span id="jump-value">${deckIndex + 1}</span></label><input id="jump" type="range" min="1" max="52" value="${deckIndex + 1}" aria-label="Jump to deck position"/><p class="footnote">Juan Tamariz’s Mnemonica · Original stack order</p>`,
  );
  const gallery = document.querySelector<HTMLDivElement>(".gallery")!;
  gallery.scrollLeft = gallery.clientWidth * deckIndex;
  gallery.addEventListener(
    "scroll",
    () => {
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
function goDeck(index: number) {
  deckIndex = Math.max(0, Math.min(51, index));
  const gallery = document.querySelector<HTMLDivElement>(".gallery")!;
  gallery.scrollTo({
    left: gallery.clientWidth * deckIndex,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
function filtered() {
  return data.attempts.filter(
    (a) =>
      (filter === "all" || a.direction === filter) &&
      (period === "all" || a.at >= Date.now() - Number(period) * 86400000),
  );
}
function trend(attempts: Attempt[]): string {
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    date.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    return {
      at: date.getTime(),
      s: summary(
        attempts.filter((a) => a.at >= date.getTime() && a.at < end.getTime()),
      ),
    };
  });
  const points = days.map((d, i) => ({
    x: 26 + i * 25,
    y: 119 - d.s.accuracy * 0.9,
    ...d,
  }));
  return `<div class="chart"><div class="chart-title"><h2>Accuracy over time</h2><span>Last 14 days</span></div><svg viewBox="0 0 380 160" role="img" aria-label="Independent accuracy by day for the last 14 days. Exact values follow below."><line x1="26" x2="352" y1="29" y2="29" stroke="#dedfd5" stroke-dasharray="3 4"/><line x1="26" x2="352" y1="74" y2="74" stroke="#dedfd5" stroke-dasharray="3 4"/><line x1="26" x2="352" y1="119" y2="119" stroke="#dedfd5"/><text x="3" y="32" font-size="9" fill="#717a74">100</text><text x="8" y="78" font-size="9" fill="#717a74">50</text>${points
    .filter((p) => p.s.eligibleTotal)
    .map(
      (p) =>
        `<line x1="${p.x}" x2="${p.x}" y1="119" y2="${p.y}" stroke="#ced9cd" stroke-width="12"/><circle cx="${p.x}" cy="${p.y}" r="4" fill="#246751"><title>${fmtDate(p.at)}: ${p.s.accuracy.toFixed(0)}%, ${p.s.total} answers</title></circle>`,
    )
    .join(
      "",
    )}<text x="26" y="145" font-size="10" fill="#717a74">${fmtDate(days[0].at)}</text><text x="323" y="145" font-size="10" fill="#717a74">Today</text></svg><details><summary>Daily accuracy &amp; speed</summary><div class="table-wrap"><table><thead><tr><th>Date</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${
    days
      .filter((d) => d.s.total)
      .map(
        (d) =>
          `<tr><td>${fmtDate(d.at)}</td><td>${d.s.total}</td><td>${d.s.accuracy.toFixed(0)}%</td><td>${fmtTime(d.s.medianMs)}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="4">No practice in the last 14 days.</td></tr>'
  }</tbody></table></div></details></div>`;
}
function progress() {
  const attempts = filtered(),
    s = summary(attempts),
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
    .filter((session) => attempts.some((a) => a.sessionId === session.id));
  chrome(
    `<section class="page-heading"><div class="eyebrow">YOUR PRACTICE, IN PERSPECTIVE</div><h1>A clearer picture.</h1><p>Accuracy first. Speed follows.</p></section><div class="filters"><label>Direction<select id="stats-direction"><option value="all">Both directions</option><option value="card-number" ${filter === "card-number" ? "selected" : ""}>Card → number</option><option value="number-card" ${filter === "number-card" ? "selected" : ""}>Number → card</option></select></label><label>Period<select id="stats-period">${[
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
      )}</select></label></div><div class="summary-grid stat-cards"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median correct answer</span></div><div><strong>${s.total}</strong><span>Questions answered</span></div><div><strong>${slow.length ? Math.round((within / slow.length) * 100) + "%" : "—"}</strong><span>Within ${data.settings.speedTarget}s target</span></div></div>${!s.total ? '<div class="empty"><span>♧</span><h2>Your story starts with a session.</h2><p>Practice results will appear here, with each direction tracked separately.</p><button class="primary" data-action="home">Go to practice →</button></div>' : `${trend(attempts)}<div class="report-notes"><span>${s.wrong} first-answer misses</span><span>${s.hints} questions with hints</span><span>${new Set(attempts.map((a) => a.position)).size}/52 cards practiced</span></div>`}<section class="report-section"><div class="chart-title"><h2>Your deck, association by association</h2><span>Tap a card for details</span></div><p class="muted compact">${filter === "all" ? "Results combine both directions. Filter above to find a directional weakness." : modeName(filter as Direction)} Timing excludes interrupted and recently exposed answers.</p><div class="table-wrap"><table class="deck-table"><thead><tr><th>Position / card</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${STACK.map(
      (_, i) => {
        const ss = summary(attempts.filter((a) => a.position === i + 1));
        return `<tr><td><button class="card-detail" data-position="${i + 1}"><span class="position-number">${i + 1}</span><span>${cardName(i + 1)}</span></button></td><td>${ss.total || "—"}</td><td><span class="accuracy ${ss.eligibleTotal && ss.accuracy < 75 ? "low" : ""}">${ss.total ? ss.accuracy.toFixed(0) + "%" : "—"}</span></td><td>${fmtTime(ss.medianMs)}</td></tr>`;
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
              return `<button class="history-row" data-session="${esc(session.id)}"><div><strong>${fmtDate(session.startedAt)} · ${new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong><span>${modeName(session.mode)} · ${ss.total} answered</span></div><div><strong>${ss.accuracy.toFixed(0)}%</strong><span>${fmtTime(ss.medianMs)}</span></div></button>`;
            })
            .join(
              "",
            )}</div>${sessions.length > historyLimit ? '<button class="text-button" data-action="more-history">Show more sessions</button>' : ""}`
        : '<p class="muted">No answered sessions in this period yet.</p>'
    }</section><div class="export-row"><button class="text-button" data-action="export">↓ Export backup</button><button class="text-button" data-action="csv">↓ Export results CSV</button></div><p class="footnote">Independent accuracy excludes recent exposure; hints and reveals count as failures. Timing also excludes interruptions. Multiple choice measures recognition; fast guesses can still be correct.</p>`,
  );
}
function detail(position: number) {
  const attempts = filtered().filter((a) => a.position === position);
  showDialog(
    `<div class="eyebrow">POSITION ${position}</div><h2>${cardName(position)}</h2>${(
      ["card-number", "number-card"] as Direction[]
    )
      .map((dir) => {
        const ss = summary(attempts.filter((a) => a.direction === dir)),
          m = data.memory[key(position, dir)];
        return `<div class="detail-direction"><h3>${modeName(dir)}</h3><p>${ss.total} answers · ${ss.total ? ss.accuracy.toFixed(0) + "%" : "—"} independent · ${fmtTime(ss.medianMs)} median</p><p class="muted">${m ? `Next review: ${m.due <= Date.now() ? "due now" : new Date(m.due).toLocaleString()}` : "Not practiced yet"}</p></div>`;
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
    `<section class="page-heading"><div class="eyebrow">MAKE IT YOURS</div><h1>A simple routine.</h1></section><section class="settings-panel"><label>Session length<select id="minutes">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${data.settings.minutes === n ? "selected" : ""}>${n} minutes</option>`).join("")}</select></label><label>Speed target<select id="speed">${[2, 3, 5, 8, 10].map((n) => `<option value="${n}" ${data.settings.speedTarget === n ? "selected" : ""}>${n} seconds</option>`).join("")}</select></label><label class="toggle-row"><span>Use speed to adapt practice<small>Slower correct associations get extra practice.</small></span><input id="adaptive-speed" type="checkbox" ${data.settings.speedAdaptive ? "checked" : ""}/></label><p class="muted">Accuracy drives your review schedule. Timing is compared within each direction and adapts gently after enough practice.</p></section><section class="settings-panel"><h2>Keep your progress</h2><p>Saved in this browser on this device. No account, tracking, or cloud sync. Clearing browser data removes your history.</p><button class="primary" data-action="export">Export a backup ↓</button><label class="file-label">Restore from a backup<input type="file" id="import" accept="application/json,.json"/></label><p class="muted">Restore replaces this device’s progress after confirmation.</p></section><section class="settings-panel"><h2>Install Deckwise</h2><p>Keep it on your home screen and practice offline after your first visit.</p><button class="primary" data-action="install">${installPrompt ? "Install app ↗" : "How to install ↗"}</button><p id="offline-status" class="muted">${navigator.onLine ? "Online" : "Offline"} · ${navigator.serviceWorker?.controller ? "Offline app ready" : "Offline setup available on the published site"}</p></section><section class="settings-panel"><h2>A fresh start</h2><button class="text-button danger" data-action="reset">Reset all progress</button></section><p class="footnote">Independent practice companion for Juan Tamariz’s Mnemonica. Deckwise v0.1 · Original card artwork.</p>`,
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
  root
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) => (b.onclick = () => route(b.dataset.view as typeof view)));
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
          `<div class="eyebrow">${fmtDate(session.startedAt)}</div><h2>${modeName(session.mode)}</h2>${attemptList(data.attempts.filter((a) => a.sessionId === session.id).reverse())}`,
        );
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-action]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        switch (b.dataset.action) {
          case "home":
            route("practice");
            break;
          case "settings":
            route("settings");
            break;
          case "start":
            start();
            break;
          case "next":
            if (!paused && q?.done) newQuestion();
            break;
          case "pause":
            if (storageConflict) return;
            tick();
            paused = !paused;
            if (q && !q.done) q.interrupted = true;
            lastTick = performance.now();
            render();
            break;
          case "hint":
            if (q && !paused && !q.done) {
              tick();
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
                '<h2>Deckwise on your home screen.</h2><p><strong>iPhone / iPad:</strong> open this site in Safari, tap Share, then “Add to Home Screen.” Enable “Open as Web App” if shown.</p><p><strong>Android:</strong> open in Chrome and choose “Install app” or “Add to Home screen” from the menu.</p><p><strong>Desktop:</strong> use the install icon in Chrome or Edge’s address bar.</p><p class="muted">Visit once online and wait for “Offline app ready” before relying on offline practice.</p>',
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
      goDeck(Number((e.target as HTMLInputElement).value) - 1),
    );
  root
    .querySelector<HTMLSelectElement>("#minutes")
    ?.addEventListener("change", (e) => {
      data.settings.minutes = Number((e.target as HTMLSelectElement).value);
      save();
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
