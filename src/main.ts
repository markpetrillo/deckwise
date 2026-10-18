
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
  updateAttempt,
  timingEligible,
  recentlyExposed,
  mappingModel,
  mixedDirection,
  RANKS,
  SUITS,
  formatOf,
  formatName,
  type AnswerFormat,
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
  type FocusMapping,
} from "./core";
import { emptyRecallInput, editRecallInput, recallPosition, recallDisplay, type RecallInput, type RecallAction } from "./recall";
import { cardImage, numberCard } from "./cards";
import {UI_STORE, loadUiState, type UiState, type QuestionState, type View, type ReportFilter} from "./ui-state";
import {weakestMappings,focusPrompt} from "./focus";
import { uiIcon } from "./icons";
import { progressTrend, TREND_WINDOW, TREND_MIN_ANSWERS, TREND_MIN_MAPPINGS, directionComparison, reportEvidence, cardRanking, mappingInsights, type CardSort, sequenceRuns } from "./reporting";
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
const restoredUi = loadUiState(data,[() => sessionStorage.getItem(UI_STORE),() => localStorage.getItem(UI_STORE)]);
let view: View = restoredUi.view,
  deckIndex = restoredUi.deckIndex,
  filter: string = restoredUi.filter,
  period: "7" | "30" | "all" = data.settings.statsPeriod ?? "7",
  historyLimit = restoredUi.historyLimit;
let cardSort: CardSort = restoredUi.cardSort;
let reportFormat: AnswerFormat | "all" = restoredUi.reportFormat;
let sequenceReportFormat: AnswerFormat | "all" = restoredUi.sequenceReportFormat;
let positionFilter = restoredUi.positionFilter, sequenceFilter = restoredUi.sequenceFilter;
const reportAnswerFormat = () => filter.startsWith("sequence") ? sequenceReportFormat : reportFormat;
let deckMode = restoredUi.deckMode;
let practiceType=restoredUi.practiceType,cardsExpanded=restoredUi.cardsExpanded,historyExpanded=restoredUi.historyExpanded;
let sequenceDirection = restoredUi.sequenceDirection;
let sequenceStart = restoredUi.sequenceStart;
let sequenceSource = 1;
let active: Session | null = null,
  sessionElapsed = 0,
  lastTick = performance.now(),
  paused = false;
let q: QuestionState | null = null;
let recent: number[] = [],
  lastExposure = new Map<number, number>();
// Preserve the one-minute guard across reloads using already saved evidence.
for (const a of data.attempts) {
  if (Date.now()-a.at >= 60000) continue;
  for (const p of [a.position,...(a.hint ? [a.position-1,a.position+1] : [])])
    if (p >= 1 && p <= 52) lastExposure.set(p,Math.max(lastExposure.get(p) ?? 0,a.at));
}
let galleryObserver: ResizeObserver | null = null;
let deckExposureObserver:IntersectionObserver|null=null;
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
// Only a checkpoint that agrees with saved history can resume; all other
// abandoned sessions retain the previous end-at-last-recorded-answer behavior.
if (restoredUi.resume && !storageProblem) {
  const resume = restoredUi.resume;
  active = data.sessions.find(s => s.id === resume.sessionId)!;
  q = resume.question;
  if (q.firstCorrect === null) q.interrupted = true;
  sessionElapsed = resume.elapsed;
  sequenceSource = resume.source;
  recent = resume.recent;
  for (const [p,at] of resume.exposures) lastExposure.set(p,Math.max(lastExposure.get(p) ?? 0,at));
  view = "practice";
  practiceType=isSequence(active.mode)?"sequence":"position";
  paused = true;
}
for (const s of data.sessions)
  if (s.endedAt === null && s.id !== active?.id)
    s.endedAt = data.attempts.filter(a => a.sessionId === s.id).at(-1)?.at ?? s.startedAt;

function saveUi() {
  if (filter.startsWith("sequence")) sequenceFilter = filter as typeof sequenceFilter;
  else positionFilter = filter as typeof positionFilter;
  const state: UiState = {version:1,view,deckMode,deckIndex,filter:filter as ReportFilter,
    positionFilter,sequenceFilter,sequenceDirection,sequenceStart,reportFormat,sequenceReportFormat,
    cardSort,historyLimit,practiceType,cardsExpanded,historyExpanded,scrollY:Math.max(0,window.scrollY || 0),
    ...(active && q && !storageConflict && !storageProblem ? {resume:{sessionId:active.id,elapsed:sessionElapsed,
      question:q,source:sequenceSource,recent:recent.slice(-10000),exposures:[...lastExposure],savedAt:Date.now()}} : {})};
  // The active question belongs to this tab; only ordinary UI preferences are
  // shared when reopening the app. Storage failures cannot block practice.
  try {sessionStorage.setItem(UI_STORE,JSON.stringify(state));} catch {}
  try {localStorage.setItem(UI_STORE,JSON.stringify({...state,resume:undefined}));} catch {}
}
function checkpointBeforeLeave() {
  tick();
  if (active && q && q.firstCorrect === null) q.interrupted = true;
  saveUi();
}
window.addEventListener("pagehide",checkpointBeforeLeave);
window.addEventListener("beforeunload",checkpointBeforeLeave);

function chrome(body: string) {
  app.innerHTML = `<div class="shell"><header class="header"><a href="#" class="brand" data-action="home"><img class="brand-mark" src="/brand-mark.svg" alt="" width="28" height="40"/>deckwise<span class="brand-dot">.</span></a></header>${storageProblem ? `<div class="warning" role="alert">${esc(storageProblem)} <button data-action="export">Export backup</button></div>` : ""}<main>${body}</main><nav class="nav" aria-label="Main navigation">${[
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
  deckExposureObserver?.disconnect();deckExposureObserver=null;
  if (active) practice();
  else if (view === "practice") practice();
  else if (view === "deck") deck();
  else if (view === "progress") progress();
  else settings();
  saveUi();
}
function selector(options: readonly (readonly [string,string])[], value:string, attribute:string, label:string) {
  return `<div class="segmented selector columns-${options.length}" role="group" aria-label="${label}">${options.map(([id,text])=>`<button data-${attribute}="${id}" aria-pressed="${value===id}" class="${value===id?"selected":""}">${text}</button>`).join("")}</div>`;
}
function practiceSetup() {
  const type=selector([["position","Position practice"],["sequence","Sequence quiz"]],practiceType,"practice-type","Quiz type");
  if(practiceType==="sequence") {
    chrome(`<section class="selection-panel practice-home">${type}${selector([["sequence-forward","Forward"],["sequence-backward","Backward"]],sequenceDirection,"sequence-direction","Sequence direction")}${formatToggle(data.settings.sequenceAnswerFormat??"multiple-choice","sequence")}${selector([["beginning","From "+(sequenceDirection==="sequence-forward"?"first card":"last card")],["random","Random start"]],sequenceStart,"sequence-start","Starting position")}<button class="primary start" data-action="start-sequence" ${storageProblem?"disabled":""}>Start 52-card run</button></section>`);
    return;
  }
  const format=formatOf(data.settings);
  const due=STACK.reduce((n,_,i)=>n+(["card-number","number-card"] as const).filter(dir=>(data.settings.mode==="mixed"||dir===data.settings.mode)&&(data.memory[key(i+1,dir,format)]?.due??Infinity)<=Date.now()).length,0);
  chrome(`<section class="selection-panel practice-home">${type}${selector([["mixed","Mixed"],["card-number","Card → number"],["number-card","Number → card"]],data.settings.mode,"mode","Practice direction")}${formatToggle(format,"practice")}${selector([["1","1 min"],["3","3 min"],["5","5 min"],["10","10 min"]],String(data.settings.minutes),"minutes","Session length")}<button class="primary start" data-action="start" ${storageProblem?"disabled":""}>Start ${data.settings.minutes}-minute session</button>${due?`<span class="quiet-count">${due} due</span>`:""}</section>`);
}
function practice() {
  if(!active){practiceSetup();return;}
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
      ? q.lastIncorrect ? `Incorrect: ${esc(q.lastIncorrect)}. Try again.` : "Incorrect. Try again."
      : q.direction === "card-number"
        ? ""
        : "";
  chrome(
    `<section class="session-top ${q.answerFormat === "direct-recall" ? "direct-session" : ""}"><div><span class="eyebrow">${isSequence(q.direction) && !active.focus && sequenceSource === 0 ? sequenceStart === "random" ? `Choose position ${q.position}` : q.direction === "sequence-forward" ? "Choose the first card" : "Choose the last card" : modeName(q.direction)}</span>${active.focus?`<span class="sequence-position">Drill ${active.focus.mappings.length} · ${stats.total-(data.attempts.some(a=>a.id===q!.id)?1:0)+1}/${active.focus.target} · ${formatName(q.answerFormat)}</span>`:isSequence(q.direction) ? `<span class="sequence-position">${stats.total - (data.attempts.some(a => a.id === q!.id) ? 1 : 0) + 1} / 52 · ${formatName(q.answerFormat)}</span>` : `<span class="answer-format-label">${formatName(q.answerFormat)}</span>`}</div><div class="session-controls"><button class="session-timer" data-action="pause" aria-label="${paused ? "Resume" : "Pause"} practice"><span id="remaining">${(active.runTarget||active.focus) ? runTime(sessionElapsed) : timer(active.duration - sessionElapsed)}</span><span>${paused ? "▶ Resume" : "Ⅱ Pause"}</span></button><button class="text-button end-session" data-action="finish">End session</button></div></section><div class="session-progress"><span id="session-bar" style="width:${(active.runTarget||active.focus) ? data.attempts.filter(a => a.sessionId === active!.id && (a.id !== q?.id || q.done)).length / (active.runTarget??active.focus!.target) * 100 : Math.min(100, (sessionElapsed / active.duration) * 100)}%"></span></div><div class="question-stage ${paused ? "paused" : ""} ${q.answerFormat === "direct-recall" ? "direct-stage" : ""} ${isSequence(q.direction) ? "sequence-stage" : ""}">${questionPrompt()}</div><div class="feedback ${q.done ? "positive" : q.wrong ? "negative" : ""}" role="status" aria-live="polite">${paused ? "Paused" : result}</div>${answerControls()}<div class="practice-actions">${q.done ? q.revealed ? `<button class="primary next" data-action="next" ${paused ? "disabled" : ""}>Next card <span>→</span></button>` : `<span class="next-status">${paused ? "Resume to continue" : "Next card…"}</span>` : `${isSequence(q.direction) ? "" : `<button class="text-button" data-action="hint" ${paused ? "disabled" : ""}>☼ Neighbor hint</button>`}<button class="text-button" data-action="reveal" ${paused ? "disabled" : ""}>Reveal answer</button>`}</div>${q.hint && !q.done ? `<div class="hint-panel">${q.position > 1 ? `<div><span>Before</span>${cardImage(q.position - 1)}</div>` : "<span>Top of deck</span>"}${q.position < 52 ? `<div><span>After</span>${cardImage(q.position + 1)}</div>` : "<span>Bottom of deck</span>"}</div>` : ""}<div class="session-bottom"><span>${stats.total} answered · ${isSequence(q.direction) ? sequenceResult(active, data.attempts).accuracy.toFixed(0) + "% first try" : (stats.eligibleTotal ? stats.accuracy.toFixed(0) + "%" : "—") + " independent"}</span></div>`,
  );
}
function questionPrompt() {
  if (!q) return "";
  if (isSequence(q.direction)) {
    // Only completed earlier questions in this run provide context. Current
    // wrong/revealed answers must not move the sequence or reveal the target.
    const opposite=q.direction==="sequence-forward"?"sequence-backward":"sequence-forward";
    const one=sequenceNeighbor(q.position,opposite),two=sequenceNeighbor(one,opposite);
    const previous = active!.focus?[{position:two},{position:one}]:data.attempts.filter(a => a.sessionId === active!.id && a.id !== q!.id).slice(-2);
    const slots = [...Array(2-previous.length).fill(null), ...previous];
    return `<div class="sequence-prompt" role="group" aria-label="Previous two cards and target position">${slots.map(a => a ? `<div class="sequence-card sequence-context" data-context-position="${a.position}" role="group" aria-label="Position ${a.position}">${cardImage(a.position)}</div>` : '<div class="sequence-card sequence-placeholder" aria-hidden="true"></div>').join("")}<div class="prompt-card sequence-card sequence-target">${numberCard(q.position)}</div></div>`;
  }
  return `<div class="prompt-card">${q.direction === "card-number" ? cardImage(q.position) : numberCard(q.position)}</div>`;
}

function formatToggle(format: AnswerFormat | "all", context: "practice" | "sequence" | "report") {
  const options: [AnswerFormat | "all",string][] = [["direct-recall","Direct recall"],["multiple-choice","Multiple choice"]];
  if (context === "report") options.push(["all","All formats"]);
  return `<div class="format-selector"><div class="segmented format-toggle" role="group" aria-label="Answer format">${options.map(([id,label]) => `<button data-${context}-format="${id}" aria-pressed="${format === id}" class="${format === id ? "selected" : ""}">${label}</button>`).join("")}</div></div>`;
}
function answerControls() {
  if (!q) return "";
  if (q.answerFormat === "multiple-choice") return `<div class="answers" aria-label="Answer choices">${q.options.map((p, i) => `<button class="answer ${q!.selected.includes(p) && p !== q!.position ? "wrong" : ""} ${q!.done && p === q!.position ? "correct" : ""}" data-answer="${p}" aria-label="${q!.direction === "card-number" ? `Position ${p}` : cardName(p)}" ${paused || q!.done || q!.selected.includes(p) ? "disabled" : ""}>${q!.direction === "card-number" ? numberCard(p) : cardImage(p)}<span class="key-label">${i + 1}</span></button>`).join("")}</div>`;
  return `<section class="recall-controls" aria-label="Direct recall answer">${directAnswerContent()}</section>`;
}
function directAnswerContent() {
  if (!q) return "";
  const disabled = paused || q.done ? "disabled" : "";
  const position = recallPosition(q.direction,q.input);
  const ready = !paused && !q.done && position !== null && !q.selected.includes(position);
  const rankNames: Record<string,string> = {A:"Ace",T:"Ten",J:"Jack",Q:"Queen",K:"King"};
  const suits: Record<string,string> = {C:"♣",D:"♦",H:"♥",S:"♠"};
  const controls = q.direction === "card-number"
    ? `<div class="digit-grid" role="group" aria-label="Position digits">${"1234567890".split("").map(d => `<button class="recall-tile digit-tile" data-digit="${d}" aria-label="Digit ${d}" ${disabled}>${d}</button>`).join("")}</div><div class="recall-edit"><button data-action="recall-backspace" aria-label="Delete last digit" ${disabled || (!q.input.digits ? "disabled" : "")}>⌫</button><button data-action="recall-clear" ${disabled}>Clear</button></div>`
    : `<div class="rank-grid" role="group" aria-label="Card rank">${RANKS.split("").map(rank => `<button class="recall-tile ${q!.input.rank === rank ? "selected" : ""}" data-rank="${rank}" aria-label="${rankNames[rank] ?? "Rank "+rank}" aria-pressed="${q!.input.rank === rank}" ${disabled}>${rank === "T" ? "10" : rank}</button>`).join("")}</div><div class="suit-grid" role="group" aria-label="Card suit">${Object.keys(SUITS).map(suit => `<button class="recall-tile suit-tile ${suit === "D" || suit === "H" ? "red-suit" : ""} ${q!.input.suit === suit ? "selected" : ""}" data-suit="${suit}" aria-label="${SUITS[suit]}, submit answer" aria-pressed="${q!.input.suit === suit}" ${disabled || (!q!.input.rank || q!.selected.includes(recallPosition(q!.direction,{...q!.input,suit}) ?? 0) ? "disabled" : "")}>${suits[suit]}</button>`).join("")}</div>`;
  const display = q.done ? q.direction === "card-number" ? String(q.position).padStart(2,"0") : cardName(q.position) : recallDisplay(q.direction,q.input);
  return `<div class="recall-entry" aria-live="polite"><span>${q.done ? "Answer" : "Your answer"}</span><strong>${display}</strong></div>${controls}${q.direction === "card-number" ? `<button class="primary recall-submit" data-action="recall-submit" ${ready ? "" : "disabled"}>Check answer</button>` : ""}<p class="recall-help">${q.done ? "" : position !== null && q.selected.includes(position) ? "Already tried. Change your answer." : q.direction === "card-number" ? "" : ""}</p>`;
}
function changeRecallInput(action: RecallAction) {
  if (!q || q.answerFormat !== "direct-recall" || paused || q.done || storageConflict) return;
  tick();
  if (paused || !q) return;
  const input = editRecallInput(q.input,action);
  if (action.type === "suit") {
    const position = recallPosition(q.direction,input);
    if (position === null || q.selected.includes(position)) return;
  }
  q.input = input;
  if (action.type === "suit") {submitRecall(); return;}
  const panel = document.querySelector<HTMLElement>(".recall-controls");
  if (panel) {panel.innerHTML = directAnswerContent(); bind(panel);}
  else render();
  saveUi();
  const selector = action.type === "digit" || action.type === "rank" ? `[data-${action.type}="${CSS.escape(action.value)}"]` : `[data-action="recall-${action.type}"]`;
  document.querySelector<HTMLButtonElement>(selector)?.focus({preventScroll:true});
}
function submitRecall() {
  if (!q || q.answerFormat !== "direct-recall") return;
  const position = recallPosition(q.direction,q.input);
  if (position !== null) answer(position);
}

function newQuestion() {
 const answered=data.attempts.filter(a=>a.sessionId===active?.id).length;
 if(active?.focus&&q?.done&&answered>=active.focus.target){finish(true);return;}
 if(active?.runTarget&&q?.done&&answered>=active.runTarget){finish(true);return;}
 if(active&&isSequence(active.mode)&&q)sequenceSource=q.position;
 const focused=active?.focus?focusPrompt(active.focus,answered):null;
 const direction:Direction=focused?.direction??(active&&isSequence(active.mode)?active.mode as SequenceDirection:data.settings.mode==="mixed"?mixedDirection(data.attempts.filter(a=>a.sessionId===active?.id)):data.settings.mode);
 const position=focused?.position??(isSequence(direction)?sequenceSource===0?active!.startPosition!:sequenceNeighbor(sequenceSource,direction as SequenceDirection):choose(data,direction,recent,Date.now(),Math.random,formatOf(active!)));
 if(focused&&isSequence(direction)){
  const opposite=direction==="sequence-forward"?"sequence-backward":"sequence-forward";
  const previous=sequenceNeighbor(position,opposite),before=sequenceNeighbor(previous,opposite);
  lastExposure.set(previous,Date.now());lastExposure.set(before,Date.now());
 }
  const exposed = recentlyExposed(position,lastExposure);
  recent.push(position);
  q = {
    id: crypto.randomUUID(),
    answerFormat: formatOf(active!),
    input: emptyRecallInput(),
    position,
    direction,
    options: formatOf(active!) === "multiple-choice" ? choices(position, direction) : [],
    elapsed: 0,
    wrong: 0,
    lastIncorrect: "",
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
function start(mode: Mode = data.settings.mode, startPosition = 1, focus?:FocusMapping[], answerFormat?:AnswerFormat) {
  if (storageProblem) return;
  view="practice";practiceType=isSequence(mode)?"sequence":"position";
  active = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    endedAt: null,
    mode,
    answerFormat: answerFormat??(isSequence(mode) ? data.settings.sequenceAnswerFormat ?? "multiple-choice" : formatOf(data.settings)),
    duration: focus||isSequence(mode) ? 0 : data.settings.minutes * 60000,
    ...(focus?{focus:{mappings:focus,target:focus.length*3,elapsedMs:0,completed:false}}:isSequence(mode) ? {runTarget:52, startPosition, elapsedMs:0, completed:false} : {}),
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
  if (active.focus) active.focus.elapsedMs = sessionElapsed;
  const a: Attempt = {
    id: q.id,
    sessionId: active.id,
    answerFormat: q.answerFormat,
    position: q.position,
    direction: q.direction,
    at: Date.now(),
    firstCorrect: q.firstCorrect,
    wrong: q.wrong,
    hint: q.hint,
    revealed: q.revealed,
    elapsedMs: q.firstMs,
    interrupted: q.interrupted,
    recentExposure: q.exposed,
    finalResult: q.done ? q.revealed ? "revealed" : q.wrong ? "corrected" : "correct" : "unresolved",
    ...(q.done ? {finalElapsedMs:q.elapsed} : {}),
  };
  updateAttempt(data,a);
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
  if (p !== q.position) {
    q.wrong++;
    if (q.answerFormat === "direct-recall") {
      q.lastIncorrect = recallDisplay(q.direction,q.input);
      q.input = emptyRecallInput();
    }
  } else q.done = true;
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
  if (isSequence(active.mode)) sequenceReportFormat = formatOf(active);
  else reportFormat = formatOf(active);
  active.endedAt = Date.now();
  if (active.runTarget) {active.elapsedMs = sessionElapsed; active.completed = completed;}
  if (active.focus) {active.focus.elapsedMs=sessionElapsed;active.focus.completed=completed;}
  save();
  active = null;
  q = null;
  paused = false;
  const attempts = data.attempts.filter((a) => a.sessionId === id),
    s = summary(attempts);
  render();
  if(session.focus){
    showDialog(`<h2>${session.focus.completed?"Drill complete":"Drill ended"}</h2><p>${attempts.length}/${session.focus.target} · ${formatName(formatOf(session))} · ${runTime(sessionElapsed)}</p><div class="summary-grid"><div><strong>${s.eligibleTotal?s.accuracy.toFixed(0)+"%":"—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median recall</span></div><div><strong>${attempts.filter(a=>!a.firstCorrect).length}</strong><span>First misses</span></div><div><strong>${isSequence(session.mode)?runTime(sessionElapsed+attempts.reduce((n,a)=>n+a.wrong+(a.revealed?1:0),0)*5000):s.hints}</strong><span>${isSequence(session.mode)?"Scored time":"Hints"}</span></div></div><button class="primary" data-action="summary-progress">View progress →</button>`);return;
  }
  if (session.runTarget) {
    showDialog(`${runResults(session)}<button class="primary" data-action="summary-progress">View progress →</button>`);
    return;
  }
  showDialog(
    `<h2>Session results</h2><p>${s.total} questions answered in ${timer(sessionElapsed)} of active practice.</p><div class="summary-grid"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median recall</span></div><div><strong>${s.wrong}</strong><span>First-answer misses</span></div><div><strong>${s.hints}</strong><span>Hints used</span></div></div><button class="primary" data-action="summary-progress">View progress →</button>`,
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
  if (!active.runTarget && !active.focus && sessionElapsed >= active.duration) {
    finish();
    return;
  }
  const remain = document.querySelector("#remaining"),
    bar = document.querySelector<HTMLElement>("#session-bar");
  if (remain) remain.textContent = (active.runTarget||active.focus) ? runTime(sessionElapsed) : timer(active.duration - sessionElapsed);
  if (bar)
    bar.style.width = `${(active.runTarget||active.focus) ? data.attempts.filter(a => a.sessionId === active!.id && (a.id !== q?.id || q.done)).length / (active.runTarget??active.focus!.target) * 100 : Math.min(100, (sessionElapsed / active.duration) * 100)}%`;
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
      period = data.settings.statsPeriod ?? "7";
      reportFormat = formatOf(data.settings);
      sequenceReportFormat = data.settings.sequenceAnswerFormat ?? "multiple-choice";
    } catch {
      storageProblem =
        "Another tab changed your saved data. Reload before continuing.";
    }
  render();
});
function galleryStep(gallery:HTMLElement) {
  return gallery.querySelector<HTMLElement>(".gallery-slide")?.offsetWidth || gallery.clientWidth;
}
function deck() {
  const tabs=selector([["browse","Cards"],["ribbon","Ribbon"],["grid","Grid"]],deckMode,"deck-mode","Deck view");
  if(deckMode==="grid") {
    chrome(`<section class="selection-panel">${tabs}</section><div class="deck-grid" aria-label="Mnemonica deck">${STACK.map((_,i)=>`<button data-browse-position="${i+1}" data-exposure-position="${i+1}" class="deck-grid-card ${i===deckIndex?"selected":""}" aria-label="Position ${i+1}, ${cardName(i+1)}"><span>${i+1}</span>${cardImage(i+1)}</button>`).join("")}</div>`);
    observeDeckExposure();
    return;
  }
  chrome(`<section class="selection-panel">${tabs}</section><div class="gallery ${deckMode==="ribbon"?"gallery-ribbon":""}" tabindex="0" aria-label="Mnemonica deck, swipe or use arrow keys">${STACK.map((_,i)=>`<article class="gallery-slide" data-exposure-position="${i+1}" aria-label="Position ${i+1}, ${cardName(i+1)}"><div class="position-pill">${i+1}<span> / 52</span></div><div class="gallery-card">${cardImage(i+1)}</div></article>`).join("")}</div><div class="gallery-controls"><button class="round" data-action="previous" aria-label="Previous card">${uiIcon("left")}</button><span id="deck-position">${deckIndex+1} of 52</span><button class="round" data-action="following" aria-label="Next card">${uiIcon("right")}</button></div><span id="jump-value" class="sr-only">${deckIndex+1}</span><input id="jump" type="range" min="1" max="52" value="${deckIndex+1}" aria-label="Jump to deck position"/>`);
  const gallery=document.querySelector<HTMLDivElement>(".gallery")!;
  gallery.scrollLeft=galleryStep(gallery)*deckIndex;
  gallery.addEventListener("scroll",()=>{
    if(view!=="deck"||!gallery.isConnected)return;
    deckIndex=Math.max(0,Math.min(51,Math.round(gallery.scrollLeft/galleryStep(gallery))));
    document.querySelector("#deck-position")!.textContent=`${deckIndex+1} of 52`;
    document.querySelector("#jump-value")!.textContent=String(deckIndex+1);
    (document.querySelector("#jump") as HTMLInputElement).value=String(deckIndex+1);
    // Symmetric Ribbon padding makes scrollLeft / step identify the center card.
    const step=galleryStep(gallery),padding=deckMode==="ribbon"?(gallery.clientWidth-step)/2:0;
    const first=Math.max(0,Math.floor((gallery.scrollLeft-padding)/step));
    const last=Math.min(51,Math.ceil((gallery.scrollLeft+gallery.clientWidth-padding)/step)-1);
    for(let i=first;i<=last;i++)lastExposure.set(i+1,Date.now());
    saveUi();
  },{passive:true});
  lastExposure.set(deckIndex+1,Date.now());
  gallery.addEventListener("keydown",e=>{
    if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();goDeck(deckIndex+(e.key==="ArrowRight"?1:-1));}
  });
  galleryObserver=new ResizeObserver(()=>gallery.scrollTo({left:galleryStep(gallery)*deckIndex,behavior:"instant"}));
  galleryObserver.observe(gallery);
  observeDeckExposure(gallery);
}
function observeDeckExposure(root:HTMLElement|null=null) {
  if(typeof IntersectionObserver==="undefined")return;
  deckExposureObserver=new IntersectionObserver(entries=>{
    if(view!=="deck")return;
    for(const entry of entries)if(entry.isIntersecting&&entry.target.isConnected)
      lastExposure.set(Number((entry.target as HTMLElement).dataset.exposurePosition),Date.now());
  },{root,threshold:0.6});
  app.querySelectorAll<HTMLElement>("[data-exposure-position]").forEach(el=>deckExposureObserver!.observe(el));
}
function goDeck(index:number,instant=false) {
  deckIndex=Math.max(0,Math.min(51,index));saveUi();
  const gallery=document.querySelector<HTMLDivElement>(".gallery");
  gallery?.scrollTo({left:galleryStep(gallery)*deckIndex,behavior:instant||matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
}
function filtered(window = period) {
  return reportEvidence(data.attempts,filter as Parameters<typeof reportEvidence>[1],reportAnswerFormat(),window);
}
function resultsCoverage(attempts: Attempt[]) {
  const total=filtered("all").length;
  const firstAt=attempts.reduce((at,a)=>Math.min(at,a.at),Infinity),lastAt=attempts.reduce((at,a)=>Math.max(at,a.at),0);
  const showYear=attempts.length>0 && [firstAt,lastAt].some(at=>new Date(at).getFullYear()!==new Date(Date.now()).getFullYear());
  const date=(at:number)=>new Date(at).toLocaleDateString(undefined,{month:"short",day:"numeric",...(showYear?{year:"numeric" as const}:{})});
  const first=attempts.length?date(firstAt):"",last=attempts.length?date(lastAt):"";
  return `<div class="results-coverage" aria-label="Results coverage">${attempts.length} of ${total} answers${first?` · ${esc(first)}${first===last?"":" – "+esc(last)}`:""}</div>`;
}
function trend(attempts: Attempt[]): string {
  const formats:AnswerFormat[]=reportFormat==="all"?["direct-recall","multiple-choice"]:[reportFormat];
  const series=formats.map(format=>progressTrend(data.sessions,attempts,format)).filter(s=>s.count>0);
  if(!series.length)return `<div class="chart progress-trend"><div class="chart-title"><span>General practice trend</span></div><p class="trend-note">Build a trend with ${TREND_MIN_ANSWERS} general-practice answers across ${TREND_MIN_MAPPINGS} mappings. Focused drills stay in your history.</p></div>`;
  return series.map(series=>{
    const {points}=series;
    const heading=`<div class="chart-title"><span>General practice trend</span><small>${formatName(series.format)}</small></div>`;
    if(!points.length)return `<div class="chart progress-trend">${heading}<p class="trend-note">${series.count} eligible answers · ${series.mappings} mappings. The trend starts at ${TREND_MIN_ANSWERS} answers across ${TREND_MIN_MAPPINGS} mappings.</p></div>`;
    const latest=points.at(-1)!;
    const maxSeconds=Math.max(data.settings.speedTarget,Math.ceil(Math.max(...points.map(p=>(p.stats.medianMs??0)/1000))));
    const firstAt=points[0].at,lastAt=latest.at;
    const positioned=points.map(p=>({...p,x:firstAt===lastAt?190:42+(p.at-firstAt)*296/(lastAt-firstAt)}));
    const accuracyY=(accuracy:number)=>142-accuracy*1.06;
    const speedY=(ms:number)=>142-ms/1000/maxSeconds*106;
    const shortDate=(at:number)=>esc(new Date(at).toLocaleDateString(undefined,{month:"short",day:"numeric"}));
    const fullDate=(at:number)=>esc(new Date(at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}));
    const path=(metric:"accuracy"|"speed")=>{
      let gap=true;
      return positioned.map(p=>{
        const value=metric==="accuracy"?p.stats.accuracy:p.stats.medianMs;
        if(value===null){gap=true;return "";}
        const point=`${gap?"M":"L"}${p.x},${metric==="accuracy"?accuracyY(value):speedY(value)}`;
        gap=false;return point;
      }).join(" ");
    };
    return `<div class="chart progress-trend">${heading}<div class="trend-legend"><span class="accuracy-key">Accuracy (%)</span><span class="speed-key">Median recall (sec)</span><span class="target-key">${data.settings.speedTarget}s target</span></div><svg viewBox="0 0 380 185" role="img" aria-label="Daily rolling general-practice accuracy and median correct recall time. Focused drills excluded. Exact rolling windows follow below."><text x="8" y="19" font-size="10" fill="#79b7ff">%</text><text x="350" y="19" font-size="10" fill="#d1b6ff">sec</text>${[0,50,100].map(n=>`<line x1="42" x2="338" y1="${accuracyY(n)}" y2="${accuracyY(n)}" stroke="#2c3e5a" stroke-dasharray="3 4"/><text x="30" y="${accuracyY(n)+3}" text-anchor="end" font-size="10" fill="#79b7ff">${n}</text><text x="350" y="${accuracyY(n)+3}" font-size="10" fill="#d1b6ff">${Number((maxSeconds*n/100).toFixed(1))}</text>`).join("")}<line class="speed-target-line" x1="42" x2="338" y1="${speedY(data.settings.speedTarget*1000)}" y2="${speedY(data.settings.speedTarget*1000)}" stroke="#9aabc6" stroke-dasharray="5 5"/><path d="${path("accuracy")}" fill="none" stroke="#79b7ff" stroke-width="2.5"/><path d="${path("speed")}" fill="none" stroke="#d1b6ff" stroke-width="2.5"/>${positioned.map(p=>`<circle cx="${p.x}" cy="${accuracyY(p.stats.accuracy)}" r="3.5" fill="#79b7ff"><title>${fullDate(p.at)}: ${p.stats.accuracy.toFixed(0)}% across ${p.stats.eligibleTotal} answers, ${p.mappings} mappings</title></circle>${p.stats.medianMs===null?"":`<circle cx="${p.x}" cy="${speedY(p.stats.medianMs)}" r="3.5" fill="#d1b6ff"><title>${fullDate(p.at)}: ${fmtTime(p.stats.medianMs)} median, ${p.stats.timedCount} timed answers</title></circle>`}`).join("")}<text x="${firstAt===lastAt?190:42}" y="171" text-anchor="${firstAt===lastAt?"middle":"start"}" font-size="10" fill="#9aabc6">${shortDate(firstAt)}</text>${firstAt===lastAt?"":`<text x="338" y="171" text-anchor="end" font-size="10" fill="#9aabc6">${shortDate(lastAt)}</text>`}</svg><p class="trend-note">Daily · up to ${TREND_WINDOW} eligible general-practice answers · drills excluded</p><details><summary>Rolling accuracy &amp; speed</summary><div class="table-wrap"><table><thead><tr><th>Through</th><th>Answers</th><th>Mappings</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${[...points].reverse().map(p=>`<tr><td>${fullDate(p.at)}<br/><small>From ${fullDate(p.from)}</small></td><td>${p.stats.eligibleTotal}<br/><small>${p.stats.timedCount} timed</small></td><td>${p.mappings}</td><td>${p.stats.accuracy.toFixed(0)}%</td><td>${fmtTime(p.stats.medianMs)}</td></tr>`).join("")}</tbody></table></div></details></div>`;
  }).join("");
}
function runResults(session: Session) {
  const r = sequenceResult(session, data.attempts);
  return `<h2>${r.complete ? "Deck completed" : "Run ended early"}</h2><p>${sessionDirectionName(session)} · ${formatName(formatOf(session))} · ${r.total}/52 answered · start position ${session.startPosition}</p><div class="summary-grid"><div><strong>${runTime(r.elapsedMs)}</strong><span>Active time</span></div><div><strong>${r.accuracy.toFixed(0)}%</strong><span>First-answer accuracy</span></div><div><strong>${runTime(r.scoredMs)}</strong><span>Scored time</span></div><div><strong>+${r.penalties * 5}s</strong><span>${r.penalties} penalties</span></div></div>`;
}
function sequenceBests() {
  const formats: AnswerFormat[] = sequenceReportFormat === "all" ? ["multiple-choice","direct-recall"] : [sequenceReportFormat];
  const directions = (["sequence-forward","sequence-backward"] as SequenceDirection[]).filter(dir => filter === "sequence" || filter === dir);
  return `<section class="report-section" aria-label="Full-deck records"><div class="summary-grid">${directions.flatMap(dir => formats.map(format => {
    const runs = sequenceRuns(data.sessions,data.attempts,dir,format,period);
    const best = [...runs].sort((a,b) => a.r.scoredMs! - b.r.scoredMs!)[0];
    const latest = runs.at(-1);
    return `<div><span>${dir === "sequence-forward" ? "Forward" : "Backward"} · ${formatName(format)}</span><strong>${best ? runTime(best.r.scoredMs) : "—"}</strong><span>Best scored time · ${runs.length} completed</span>${best ? `<p class="muted compact">${runTime(best.r.elapsedMs)} raw · ${best.r.accuracy.toFixed(0)}% accuracy</p>` : ""}${latest ? `<p class="muted compact">Latest: ${runTime(latest.r.scoredMs)}</p>` : ""}</div>`;
  })).join("")}</div></section>`;
}
function sequenceTrend() {
  const runs = sequenceRuns(data.sessions,data.attempts,filter as SequenceDirection | "sequence",sequenceReportFormat,period).slice(-20);
  if (!runs.length) return "";
  const max = Math.max(...runs.map(x => x.r.scoredMs!), 1000);
  const point = (i: number, ms: number) => `${30 + i * 320 / Math.max(1,runs.length-1)},${125 - ms / max * 100}`;
  return `<div class="chart run-trend"><div class="trend-legend"><span>Raw time</span><span>Scored time</span><span>${runs.length} runs</span></div><svg viewBox="0 0 380 160" role="img" aria-label="Raw and penalty-adjusted completion times; exact times and accuracy appear below"><line x1="30" x2="350" y1="125" y2="125" stroke="#2c3e5a"/><polyline points="${runs.map((x,i)=>point(i,x.r.elapsedMs!)).join(" ")}" fill="none" stroke="#3979cb" stroke-width="2"/><polyline points="${runs.map((x,i)=>point(i,x.r.scoredMs!)).join(" ")}" fill="none" stroke="#b3d3ff" stroke-width="2"/>${runs.map((x,i)=>`<circle cx="${point(i,x.r.scoredMs!).split(",")[0]}" cy="${point(i,x.r.scoredMs!).split(",")[1]}" r="3" fill="#b3d3ff"><title>${fmtDate(x.s.startedAt)} · ${formatName(formatOf(x.s))}: ${runTime(x.r.scoredMs)} scored, ${x.r.accuracy.toFixed(0)}% accuracy</title></circle>`).join("")}<text x="30" y="150" font-size="10" fill="#9aabc6">${fmtDate(runs[0].s.startedAt)}</text><text x="310" y="150" font-size="10" fill="#9aabc6">Latest</text></svg><div class="table-wrap"><table><thead><tr><th>Run</th><th>Raw</th><th>Scored</th><th>Accuracy</th></tr></thead><tbody>${[...runs].reverse().map(({s,r})=>`<tr><td>${fmtDate(s.startedAt)}<br/><small>${s.mode === "sequence-forward" ? "Forward" : "Backward"} · ${formatName(formatOf(s))}</small></td><td>${runTime(r.elapsedMs)}</td><td>${runTime(r.scoredMs)}</td><td>${r.accuracy.toFixed(0)}%</td></tr>`).join("")}</tbody></table></div></div>`;
}
function directionInsights() {
  const evidence = reportEvidence(data.attempts,"all",reportFormat,period);
  const comparison = directionComparison(evidence);
  const note = comparison.reason === "insufficient" ? "Build evidence in both directions before choosing a focus. Comparisons need 20 eligible answers across two sessions per direction, covering at least 10 shared cards."
    : comparison.reason === "accuracy" ? `Focus on ${modeName(comparison.focus!)}: accuracy is ${comparison.accuracyGap.toFixed(0)} percentage points lower on shared cards.`
    : comparison.reason === "speed" ? `Focus on ${modeName(comparison.focus!)}: ${comparison.accuracyGap < 5 ? "accuracy is similar, but " : ""}median correct recall is ${fmtTime(comparison.speedGapMs)} slower on shared cards.`
    : comparison.reason === "tradeoff" ? "One direction is faster, while the other is more accurate. Prioritize clean recall before pushing for speed."
    : "No clear direction gap in recent practice. Keep both directions in rotation.";
  const cues = mappingInsights(evidence,data.settings.speedTarget,comparison.focus);
  const subset = cues.recentMisses >= 5 ? `${cues.concentratedMappings} mappings account for ${cues.coveredMisses} of ${cues.recentMisses} recent first-answer misses.` :
    cues.slowMappings ? `${cues.slowMappings} mappings are usually correct but still above your ${data.settings.speedTarget}s target.` :
    cues.variableMappings ? `${cues.variableMappings} mappings have variable recall times.` : "";
  return `<section class="report-section direction-comparison"><div class="summary-grid direction-cards">${(["card-number","number-card"] as const).map(dir => {
    const s = dir === "card-number" ? comparison.card : comparison.number;
    return `<div class="direction-card ${comparison.focus === dir ? "focus-direction" : ""}"><h3>${modeName(dir)}</h3><strong>${s.eligibleTotal ? s.accuracy.toFixed(0)+"%" : "—"}</strong><span>Independent accuracy</span><div class="direction-speed">${fmtTime(s.medianMs)}</div><span>Median recall</span><p class="muted compact">${s.eligibleTotal} eligible answers</p><button class="secondary" data-practice-direction="${dir}">Practice</button></div>`;
  }).join("")}</div>${comparison.reason!=="insufficient"?`<div class="practice-focus"><p>${note}</p>${subset?`<p>${subset}</p>`:""}</div>`:""}</section>`;
}
function weakestSet() {
 const directions:Direction[]=filter==="sequence"?["sequence-forward","sequence-backward"]:filter==="all"?["card-number","number-card"]:[filter as Direction];
 let format:AnswerFormat=reportAnswerFormat()==="all"?(filter.startsWith("sequence")?data.settings.sequenceAnswerFormat??"multiple-choice":formatOf(data.settings)):reportAnswerFormat() as AnswerFormat;
 const evidence=filtered();let mappings=weakestMappings(evidence,directions,format,data.settings.speedTarget);
 if(!mappings.length&&reportAnswerFormat()==="all"){format=format==="direct-recall"?"multiple-choice":"direct-recall";mappings=weakestMappings(evidence,directions,format,data.settings.speedTarget);}
 return {format,mappings};
}
function needsWork() {
 const {format,mappings}=weakestSet();if(!mappings.length)return "";
 return `<section class="weakest-panel" aria-label="Needs work"><div class="weakest-list">${mappings.map(m=>`<button data-position="${m.position}" class="weakest-row"><span><strong>${m.direction==="card-number"?cardName(m.position):"Position "+m.position}</strong><small>${modeName(m.direction)}</small></span><span><strong>${m.model.category}</strong><small>${fmtTime(m.model.recent.medianMs)}</small></span></button>`).join("")}</div><button class="primary" data-action="drill-weakest" ${storageProblem?"disabled":""}>Drill weakest ${mappings.length}</button>${reportAnswerFormat()==="all"?`<span class="quiet-count">${formatName(format)}</span>`:""}</section>`;
}
function startFocus() {
 const {format,mappings}=weakestSet();if(!mappings.length)return;
 const focus=mappings.map(({position,direction})=>({position,direction}));
 practiceType=isSequence(focus[0].direction)?"sequence":"position";
 const mode:Mode=practiceType==="sequence"?focus[0].direction:new Set(focus.map(m=>m.direction)).size>1?"mixed":focus[0].direction;
 if(practiceType==="sequence")data.settings.sequenceAnswerFormat=format;else data.settings.answerFormat=format;
 start(mode,1,focus,format);
}
function sessionDirectionName(s:Session) {
 return s.focus&&new Set(s.focus.mappings.map(m=>m.direction)).size>1?(isSequence(s.mode)?"Both sequence directions":"Mixed directions"):modeName(s.mode);
}
function sessionLabel(s:Session,count:number) {
 return s.focus?`Drill ${s.focus.mappings.length} · ${count}/${s.focus.target}`:s.runTarget?`${count}/52`:`${s.duration/60000} min · ${count} answered`;
}
function perCardResults(attempts:Attempt[]) {
 const sequence=filter.startsWith("sequence");
 const rows=sequence?STACK.map((_,i)=>({position:i+1,stats:summary(attempts.filter(a=>a.position===i+1)),weakest:null})):cardRanking(attempts,filter as "all"|"card-number"|"number-card",data.settings.speedTarget,cardSort);
 return `<details id="all-cards" data-disclosure="cards" class="report-section" ${cardsExpanded?"open":""}><summary>All 52 cards <small class="card-table-scope">· ${period === "all" ? "All time" : period+" days"}</small></summary>${sequence?"":`<select id="card-sort" class="card-sort-select" aria-label="Card order">${([["position","Position"],["mastery","Weakest recall"],["speed","Slowest recent recall"],["accuracy","Lowest recent accuracy"],["misses","Latest first miss"]] as const).map(([id,label])=>`<option value="${id}" ${cardSort===id?"selected":""}>${label}</option>`).join("")}</select>`}<div class="table-wrap"><table class="deck-table"><thead><tr><th>Position / card</th><th>Answers</th><th>Accuracy</th><th>Median</th></tr></thead><tbody>${rows.map(({position,stats:ss,weakest:m})=>`<tr><td><button class="card-detail" data-position="${position}"><span class="position-number">${position}</span><span>${cardName(position)}${m?`<small class="recall-label" title="Recall score ${m.score.toFixed(0)}/100">${m.category}${filter==="all"?m.direction==="card-number"?" · C → #":" · # → C":""}${m.consistency==="Variable"?" · variable":""}</small>`:""}</span></button></td><td>${ss.total||"—"}${!sequence&&ss.total?`<small class="sample-count">${ss.timedCount} timed</small>`:""}</td><td><span class="accuracy ${ss.eligibleTotal&&ss.accuracy<75?"low":""}">${ss.eligibleTotal?ss.accuracy.toFixed(0)+"%":"—"}</span></td><td>${fmtTime(ss.medianMs)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function emptyResults() {
  const sequence = filter.startsWith("sequence");
  const action = sequence ? 'data-action="sequence-setup"' : 'data-action="position-setup"';
  return `<div class="empty"><h2>No results in this view</h2><button class="primary" ${action}>${sequence ? "Go to sequence quiz" : "Go to practice"}</button></div>`;
}

function progress() {
  const attempts = filtered(),
    s = summary(filter.startsWith("sequence") ? attempts.map(a => ({...a,recentExposure:false})) : attempts),
    slow = attempts.filter(timingEligible),
    within = slow.filter(
      (a) => a.elapsedMs! <= data.settings.speedTarget * 1000,
    ).length;
  const sessions = [...data.sessions]
    .reverse()
    .filter(session => (filter === "all" ? !isSequence(session.mode) : filter === "sequence" ? isSequence(session.mode) : session.mode === filter || session.focus?.mappings.some(m=>m.direction===filter) || (!isSequence(filter) && session.mode === "mixed")) &&
      (period === "all" || session.startedAt >= Date.now() - Number(period) * 86400000) && (reportAnswerFormat() === "all" || formatOf(session) === reportAnswerFormat()));
  chrome(
    `<section class="progress-controls" aria-label="Progress filters"><div class="segmented quiz-type-toggle" role="group" aria-label="Quiz type">${[["position","Position practice"],["sequence","Sequence quiz"]].map(([id,label]) => `<button data-stats-type="${id}" aria-pressed="${(filter.startsWith("sequence") ? "sequence" : "position") === id}" class="${(filter.startsWith("sequence") ? "sequence" : "position") === id ? "selected" : ""}">${label}</button>`).join("")}</div><div class="segmented practice-toggle position-directions" role="group" aria-label="${filter.startsWith("sequence") ? "Sequence direction" : "Practice type"}">${(filter.startsWith("sequence") ? [["sequence-forward","Forward"],["sequence-backward","Backward"],["sequence","Combined"]] : [["all","Mixed"],["card-number","Card → number"],["number-card","Number → card"]]).map(([id,label]) => `<button data-stats-direction="${id}" aria-pressed="${filter === id}" class="${filter === id ? "selected" : ""}">${label}</button>`).join("")}</div>${formatToggle(reportAnswerFormat(),"report")}<div class="segmented stats-period-toggle" role="group" aria-label="Statistics period">${[["7","7 days"],["30","30 days"],["all","All time"]].map(([id,label]) => `<button data-stats-period="${id}" aria-pressed="${period === id}" class="${period === id ? "selected" : ""}">${label}</button>`).join("")}</div>${resultsCoverage(attempts)}</section><div class="summary-grid stat-cards"><div><strong>${s.eligibleTotal ? s.accuracy.toFixed(0) + "%" : "—"}</strong><span>Independent accuracy</span></div><div><strong>${fmtTime(s.medianMs)}</strong><span>Median recall</span></div><div><strong>${s.total}</strong><span>Questions answered</span></div><div><strong>${slow.length ? Math.round((within / slow.length) * 100) + "%" : "—"}</strong><span>Within ${data.settings.speedTarget}s target</span></div></div>${needsWork()}${!s.total ? emptyResults() : `${filter.startsWith("sequence") ? sequenceTrend() : trend(attempts)}<div class="report-notes"><span>${s.wrong} first-answer misses</span><span>${s.hints} questions with hints</span><span>${new Set(attempts.map((a) => a.position)).size}/52 cards practiced</span></div>`}${filter.startsWith("sequence") ? sequenceBests() : directionInsights()}${perCardResults(attempts)}<details id="session-history" data-disclosure="history" class="report-section" ${historyExpanded?"open":""}><summary>Sessions (${sessions.length})</summary>${
      sessions.length
        ? `<div class="history-list">${sessions
            .slice(0, historyLimit)
            .map((session) => {
              const sessionAttempts = attempts.filter((a) => a.sessionId === session.id);
              const ss = summary(sessionAttempts);
              const run = session.runTarget ? sequenceResult(session, data.attempts) : null;
              return `<div class="history-entry"><button class="history-row" data-session="${esc(session.id)}"><div><strong>${fmtDate(session.startedAt)} · ${new Date(session.startedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong><span>${!isSequence(filter) && filter !== "all" ? modeName(filter as Direction) : sessionDirectionName(session)} · ${run ? `${run.total}/52 · ${run.complete ? "complete" : "partial"} · ${formatName(formatOf(session))}` : `${sessionLabel(session,data.attempts.filter(a=>a.sessionId===session.id).length)} · ${formatName(formatOf(session))}`}</span></div><div><strong>${run ? run.accuracy.toFixed(0) + "%" : ss.eligibleTotal ? ss.accuracy.toFixed(0) + "%" : "—"}</strong><span>${run ? runTime(run.scoredMs) : fmtTime(ss.medianMs)}</span></div></button><button class="delete-session" data-delete-session="${esc(session.id)}" aria-label="Delete session from ${esc(fmtDate(session.startedAt))}">${uiIcon("trash")}</button></div>`;
            })
            .join(
              "",
            )}</div>${sessions.length > historyLimit ? '<button class="text-button" data-action="more-history">Show more sessions</button>' : ""}`
        : '<p class="muted">No sessions in this period.</p>'
    }</details>${recentlyDeleted()}<div class="export-row"><button class="text-button" data-action="export">↓ Export backup</button><button class="text-button" data-action="csv">↓ Export results CSV</button></div><details class="report-section scoring-notes"><summary>Scoring notes</summary><p class="footnote">Independent accuracy excludes recent exposure; hints and reveals count as failures. Timing also excludes interruptions. ${reportAnswerFormat() === "all" ? "Choose one answer format for comparable timing." : reportAnswerFormat() === "direct-recall" ? "Direct recall timing includes entering your answer." : "Multiple choice measures recognition; fast guesses can still be correct."}</p></details>`,
  );
}
function recentlyDeleted() {
  const deleted = [...(data.deletedSessions ?? [])].sort((a,b) => b.deletedAt-a.deletedAt);
  if (!deleted.length) return "";
  return `<details class="report-section deleted-history"><summary>Recently deleted (${deleted.length})</summary>${deleted.map(({session, attempts}) => `<div class="history-entry"><div class="deleted-session-info"><strong>${fmtDate(session.startedAt)} · ${new Date(session.startedAt).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</strong><span>${sessionDirectionName(session)} · ${formatName(formatOf(session))} · ${sessionLabel(session,attempts.length)}</span></div><button class="secondary restore-session" data-restore-session="${esc(session.id)}">Restore</button></div>`).join("")}</details>`;
}
function confirmRestoreSession(id: string) {
  if (active || storageConflict || storageProblem) return;
  const old = data;
  const candidate = validate(JSON.parse(JSON.stringify(data)));
  const session = candidate.deletedSessions?.find(d => d.session.id === id)?.session;
  if (!session || !restoreSession(candidate,id)) return;
  candidate.settings.statsPeriod = "all";
  data = candidate;
  if (!save()) {
    data = old;
    showDialog('<h2>Session not restored</h2><p>Storage could not be updated. The deleted session was retained for recovery.</p>');
    return;
  }
  filter = isSequence(session.mode) ? "sequence" : "all";
  if (isSequence(session.mode)) sequenceReportFormat = formatOf(session);
  else reportFormat = formatOf(session);
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
  const format = reportAnswerFormat();
  const attempts = filtered().filter((a) => a.position === position);
  showDialog(
    `<div class="eyebrow">POSITION ${position}</div><h2>${cardName(position)}</h2>${(
      (filter.startsWith("sequence") ? ["sequence-forward", "sequence-backward"] : ["card-number", "number-card"]) as Direction[]
    )
      .map((dir) => {
        const ss = summary(attempts.filter((a) => a.direction === dir)),
          m = format === "all" ? undefined : data.memory[key(position, dir,format)];
        const model = isSequence(dir) ? null : mappingModel(data.attempts,position,dir,data.settings.speedTarget,Date.now(),format === "all" ? undefined : format);
        return `<div class="detail-direction"><h3>${modeName(dir)}</h3><p>${ss.total} answers · ${ss.eligibleTotal ? ss.accuracy.toFixed(0) + "%" : "—"} independent · ${fmtTime(ss.medianMs)} median in selected period</p>${model ? `<div class="recall-detail"><strong>Current recall: ${model.category} · ${model.score.toFixed(0)}/100</strong><p>Last ${model.recent.eligibleTotal} eligible answers: ${model.recent.eligibleTotal ? model.recent.accuracy.toFixed(0)+"%" : "—"} independent · ${fmtTime(model.recent.medianMs)} median · ${model.recent.timedCount} timed</p><p>Lifetime: ${model.lifetime.eligibleTotal ? model.lifetime.accuracy.toFixed(0)+"%" : "—"} independent · ${fmtTime(model.lifetime.medianMs)} median · ${model.lifetime.timedCount} timed</p><p>${model.consistency} · recent P75 ${fmtTime(model.p75Ms)} · ${model.recentMisses} first misses · ${model.recentAssists} assisted</p><small>${model.confidence < 1 || model.timingConfidence < 1 ? "Still building evidence. " : ""}Automatic needs consistent recall within ${data.settings.speedTarget / 2}s; fast is within your ${data.settings.speedTarget}s target. Timing exclusions preserve raw history.</small></div>` : ""}<p class="muted">${format === "all" ? "Choose an answer format to see its review date." : m ? `Next review: ${m.due <= Date.now() ? "due now" : new Date(m.due).toLocaleString()}` : "Not practiced yet"}</p></div>`;
      })
      .join(
        "",
      )}<h3>Recent attempts</h3>${attemptList(attempts.slice(-15).reverse())}`,
  );
}
function attemptList(attempts: Attempt[]) {
  return `<div class="attempt-list">${attempts.map((a) => `<div><strong>${fmtDate(a.at)} · ${modeName(a.direction)} · ${formatName(formatOf(a))}</strong><span>${a.revealed ? "Revealed" : a.hint ? "Assisted" : a.firstCorrect ? "Correct first try" : `${a.wrong} wrong answer${a.wrong === 1 ? "" : "s"}`} · ${fmtTime(a.elapsedMs)}${a.interrupted ? " · interrupted" : ""}${a.recentExposure ? " · recent exposure" : ""}${a.finalResult ? ` · ${a.finalResult}${a.finalElapsedMs !== undefined ? ` after ${fmtTime(a.finalElapsedMs)}` : ""}` : " · final outcome not recorded"}${a.elapsedMs !== null && (a.elapsedMs > 120000 || a.elapsedMs <= 0) ? " · excluded from recall timing" : ""}</span></div>`).join("") || '<p class="muted">No attempts yet.</p>'}</div>`;
}
function settings() {
  chrome(
    `<section class="settings-panel"><label>Session length<select id="minutes">${[1, 3, 5, 10].map((n) => `<option value="${n}" ${data.settings.minutes === n ? "selected" : ""}>${n} minutes</option>`).join("")}</select></label><label>Speed target<select id="speed">${[2, 3, 5, 8, 10].map((n) => `<option value="${n}" ${data.settings.speedTarget === n ? "selected" : ""}>${n} seconds</option>`).join("")}</select></label><label class="toggle-row"><span>Prioritize slower recall</span><input id="adaptive-speed" type="checkbox" ${data.settings.speedAdaptive ? "checked" : ""}/></label></section><section class="settings-panel"><button class="primary" data-action="export">Export a backup ↓</button><label class="file-label">Restore from a backup<input type="file" id="import" accept="application/json,.json"/></label></section><section class="settings-panel"><button class="primary" data-action="install">${installPrompt ? "Install app ↗" : "How to install ↗"}</button><p id="offline-status" class="muted">${navigator.onLine ? "Online" : "Offline"} · ${navigator.serviceWorker?.controller ? "Offline app ready" : "Offline setup available on the published site"}</p></section><section class="settings-panel"><button class="text-button danger" data-action="reset">Reset all progress</button></section><p class="footnote">Independent practice companion for Juan Tamariz’s Mnemonica. Deckwise v0.3 · <a href="https://www.me.uk/cards/" target="_blank" rel="noopener">Card artwork: Adrian Kennard (CC0)</a>.</p>`,
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
    "answerFormat",
    "finalResult",
    "finalElapsedMs",
    "practiceKind",
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
          formatOf(a),
          a.finalResult ?? "",
          a.finalElapsedMs ?? "",
          data.sessions.find(s=>s.id===a.sessionId)?.focus?"focused-drill":isSequence(a.direction)?"sequence":"position",
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
  window.scrollTo(0, 0);
  render();
}
function setStatsPeriod(next: "7" | "30" | "all") {
  period = next;
  data.settings.statsPeriod = next;
  save();
  render();
}
function bind(root: ParentNode = app) {
  root.querySelectorAll<HTMLElement>("[data-practice-format]").forEach(b => b.onclick = () => {
    data.settings.answerFormat = b.dataset.practiceFormat as AnswerFormat;
    reportFormat = data.settings.answerFormat;
    save(); render();
  });
  root.querySelectorAll<HTMLElement>("[data-sequence-format]").forEach(b => b.onclick = () => {data.settings.sequenceAnswerFormat = b.dataset.sequenceFormat as AnswerFormat; sequenceReportFormat = data.settings.sequenceAnswerFormat; save(); render();});
  root.querySelectorAll<HTMLElement>("[data-report-format]").forEach(b => b.onclick = () => {if (filter.startsWith("sequence")) sequenceReportFormat = b.dataset.reportFormat as typeof sequenceReportFormat; else reportFormat = b.dataset.reportFormat as typeof reportFormat; render();});
  root.querySelectorAll<HTMLElement>("[data-digit]").forEach(b => b.onclick = () => changeRecallInput({type:"digit",value:b.dataset.digit!}));
  root.querySelectorAll<HTMLElement>("[data-rank]").forEach(b => b.onclick = () => changeRecallInput({type:"rank",value:b.dataset.rank!}));
  root.querySelectorAll<HTMLElement>("[data-suit]").forEach(b => b.onclick = () => changeRecallInput({type:"suit",value:b.dataset.suit!}));

  root.querySelector<HTMLSelectElement>("#card-sort")?.addEventListener("change", e => {cardSort = (e.target as HTMLSelectElement).value as CardSort; render();});
  root.querySelectorAll<HTMLElement>("[data-stats-period]").forEach(b => b.onclick = () => setStatsPeriod(b.dataset.statsPeriod as typeof period));
  root.querySelectorAll<HTMLElement>("[data-stats-type]").forEach(b => b.onclick = () => {filter = b.dataset.statsType === "sequence" ? sequenceFilter : positionFilter; render();});
  root.querySelectorAll<HTMLElement>("[data-stats-direction]").forEach(b => b.onclick = () => {filter = b.dataset.statsDirection!; render();});
  root.querySelectorAll<HTMLElement>("[data-practice-type]").forEach(b=>b.onclick=()=>{practiceType=b.dataset.practiceType as typeof practiceType;render();});
  root.querySelectorAll<HTMLElement>("[data-minutes]").forEach(b=>b.onclick=()=>{data.settings.minutes=Number(b.dataset.minutes);save();render();});
  root.querySelectorAll<HTMLElement>("[data-sequence-start]").forEach(b=>b.onclick=()=>{sequenceStart=b.dataset.sequenceStart as typeof sequenceStart;saveUi();render();});
  root.querySelectorAll<HTMLElement>("[data-browse-position]").forEach(b=>b.onclick=()=>{deckIndex=Number(b.dataset.browsePosition)-1;deckMode="browse";window.scrollTo(0,0);render();});
  root.querySelectorAll<HTMLDetailsElement>("[data-disclosure]").forEach(d=>d.addEventListener("toggle",()=>{if(!d.isConnected)return;if(d.dataset.disclosure==="cards")cardsExpanded=d.open;else historyExpanded=d.open;saveUi();}));
  root.querySelectorAll<HTMLElement>("[data-practice-direction]").forEach(b => b.onclick = () => {practiceType="position";data.settings.mode = b.dataset.practiceDirection as Mode; if (reportFormat !== "all") data.settings.answerFormat = reportFormat; save(); route("practice");});
  root.querySelectorAll<HTMLElement>("[data-restore-session]").forEach(b => b.onclick = () => confirmRestoreSession(b.dataset.restoreSession!));
  root.querySelectorAll<HTMLElement>("[data-deck-mode]").forEach(b => b.onclick = () => {deckMode = b.dataset.deckMode as typeof deckMode; render();});
  root.querySelectorAll<HTMLElement>("[data-sequence-direction]").forEach(b => b.onclick = () => {sequenceDirection = b.dataset.sequenceDirection as SequenceDirection; render();});
  root.querySelector<HTMLSelectElement>("#sequence-start")?.addEventListener("change", e => {sequenceStart = (e.target as HTMLSelectElement).value as typeof sequenceStart; saveUi();});
  root.querySelectorAll<HTMLElement>('[data-delete-session]').forEach(b =>
    b.onclick = () => requestDeleteSession(b.dataset.deleteSession!));
  root.querySelectorAll<HTMLElement>('[data-confirm-delete]').forEach(b =>
    b.onclick = () => confirmDeleteSession(b.dataset.confirmDelete!));
  root
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((b) => (b.onclick = () => { route(b.dataset.view as typeof view); }));
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
        const detailAttempts = isSequence(session.mode) ? data.attempts : filtered();
        showDialog(
          `<div class="eyebrow">${fmtDate(session.startedAt)}</div>${session.runTarget ? runResults(session) : `<h2>${filter === "all"||filter==="sequence" ? sessionDirectionName(session) : modeName(filter as Direction)}</h2><p>${session.focus?sessionLabel(session,data.attempts.filter(a=>a.sessionId===session.id).length):session.duration / 60000+"-minute session"} · ${formatName(formatOf(session))}</p>`}${attemptList(detailAttempts.filter((a) => a.sessionId === session.id).reverse())}<button class="text-button danger" data-delete-session="${esc(session.id)}">Delete session</button>`,
        );
      }),
  );
  root.querySelectorAll<HTMLElement>("[data-action]").forEach(
    (b) =>
      (b.onclick = (e) => {
        e.preventDefault();
        switch (b.dataset.action) {
          case "recall-submit":
            submitRecall(); break;
          case "recall-backspace":
            changeRecallInput({type:"backspace"}); break;
          case "recall-clear":
            changeRecallInput({type:"clear"}); break;
          case "close-dialog":
            document.querySelector<HTMLDialogElement>("dialog")?.close();
            break;
          case "home":
            route("deck");
            break;
          case "settings":
            route("settings");
            break;
          case "sequence-setup":
            practiceType="sequence";route("practice");break;
          case "position-setup":
            practiceType="position";route("practice");break;
          case "drill-weakest":
            startFocus();break;
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
            if(active?.focus){active.focus.elapsedMs=sessionElapsed;save();}
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
                period = "7";
                reportFormat = "multiple-choice";
                sequenceReportFormat = "multiple-choice";
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
          period = data.settings.statsPeriod ?? "7";
      reportFormat = formatOf(data.settings);
      sequenceReportFormat = data.settings.sequenceAnswerFormat ?? "multiple-choice";
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
    if (q.answerFormat === "direct-recall") {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") {
        if (q.done) {e.preventDefault(); newQuestion();}
        else if (q.direction === "card-number") {e.preventDefault(); submitRecall();}
      }
      else if (q.direction === "card-number") {
        if (/^[0-9]$/.test(e.key)) {e.preventDefault(); changeRecallInput({type:"digit",value:e.key});}
        else if (e.key === "Backspace") {e.preventDefault(); changeRecallInput({type:"backspace"});}
        else if (e.key === "Escape") {e.preventDefault(); changeRecallInput({type:"clear"});}
      } else {
        const value = e.key.toUpperCase();
        if ("CDHS".includes(value) && value.length === 1) {e.preventDefault(); changeRecallInput({type:"suit",value});}
        else if (RANKS.includes(value) && value.length === 1) {e.preventDefault(); changeRecallInput({type:"rank",value});}
      }
      return;
    }
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
requestAnimationFrame(() => {window.scrollTo(0,restoredUi.scrollY); saveUi();});
