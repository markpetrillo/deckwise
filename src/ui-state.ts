import {formatOf, isSequence, validSubmissions, type Submission, RANKS, SUITS, type AnswerFormat, type Data, type Direction, type SequenceDirection} from "./core";
import {focusPrompt} from "./focus";
import {type RecallInput} from "./recall";
import {type CardSort} from "./reporting";

export const UI_STORE = "deckwise.ui.v1";
export type View = "deck" | "practice" | "progress" | "settings";
export type ReportFilter = "all" | "card-number" | "number-card" | "sequence" | SequenceDirection;
export interface QuestionState {
  submissions?:Submission[];
  id: string; answerFormat: AnswerFormat; input: RecallInput; position: number; direction: Direction;
  options: number[]; elapsed: number; wrong: number; lastIncorrect: string;
  hint: boolean; revealed: boolean; interrupted: boolean; firstMs: number | null;
  firstCorrect: boolean | null; done: boolean; exposed: boolean; selected: number[];
}
export interface ResumeState {
  sessionId: string; elapsed: number; question: QuestionState; source: number;
  recent: number[]; exposures: [number,number][]; savedAt: number;
}
export interface UiState {
  version: 1; view: View; deckMode: "browse" | "ribbon" | "grid"; deckIndex: number;
  practiceType:"sequence"|"position"; cardsExpanded:boolean; historyExpanded:boolean;
  sequenceDirection: SequenceDirection; sequenceStart: "beginning" | "random";
  filter: ReportFilter; positionFilter: "all" | "card-number" | "number-card";
  sequenceFilter: "sequence" | SequenceDirection;
  reportFormat: AnswerFormat | "all"; sequenceReportFormat: AnswerFormat | "all";
  focusBothDirections:boolean;
  trendPeriod:"7"|"30"|"90"|"all";
  cardSort: CardSort; historyLimit: number; scrollY: number; resume?: ResumeState;
}
const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const position = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 52;
function pick<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}
export function defaultUiState(data: Data): UiState {
  return {version:1,view:"practice",deckMode:"browse",deckIndex:0,practiceType:"position",cardsExpanded:false,historyExpanded:false,sequenceDirection:"sequence-forward",sequenceStart:"beginning",
    filter:"all",positionFilter:"all",sequenceFilter:"sequence",reportFormat:formatOf(data.settings),
    sequenceReportFormat:data.settings.sequenceAnswerFormat ?? "multiple-choice",cardSort:"position",historyLimit:12,scrollY:0,focusBothDirections:false,trendPeriod:"30"};
}
/** UI recovery is optional; malformed preferences must never affect answer history. */
export function restoreUiState(value: unknown, data: Data): UiState {
  const d = defaultUiState(data);
  if (!object(value) || value.version !== 1) return d;
  const formats = ["multiple-choice","direct-recall","all"] as const;
  return {...d,
    view:value.practiceType===undefined&&value.view==="deck"&&value.deckMode==="quiz"?"practice":pick(value.view,["deck","practice","progress","settings"],d.view),
    deckMode:pick(value.deckMode,["browse","ribbon","grid"],d.deckMode),
    practiceType:pick(value.practiceType,["sequence","position"],value.deckMode==="quiz"?"sequence":d.practiceType),
    cardsExpanded:typeof value.cardsExpanded==="boolean"?value.cardsExpanded:false,
    historyExpanded:typeof value.historyExpanded==="boolean"?value.historyExpanded:false,
    deckIndex:Number.isInteger(value.deckIndex) && Number(value.deckIndex) >= 0 && Number(value.deckIndex) < 52 ? Number(value.deckIndex) : 0,
    sequenceDirection:pick(value.sequenceDirection,["sequence-forward","sequence-backward"],d.sequenceDirection),
    sequenceStart:pick(value.sequenceStart,["beginning","random"],d.sequenceStart),
    filter:pick(value.filter,["all","card-number","number-card","sequence","sequence-forward","sequence-backward"],d.filter),
    positionFilter:pick(value.positionFilter,["all","card-number","number-card"],d.positionFilter),
    sequenceFilter:pick(value.sequenceFilter,["sequence","sequence-forward","sequence-backward"],d.sequenceFilter),
    reportFormat:pick(value.reportFormat,formats,d.reportFormat),
    sequenceReportFormat:pick(value.sequenceReportFormat,formats,d.sequenceReportFormat),
    focusBothDirections:value.focusBothDirections===true,
    trendPeriod:pick(value.trendPeriod,["7","30","90","all"],d.trendPeriod),
    cardSort:pick(value.cardSort,["position","mastery","speed","accuracy","misses"],d.cardSort),
    historyLimit:Number.isInteger(value.historyLimit) && Number(value.historyLimit) >= 12 && Number(value.historyLimit) <= 10000 ? Number(value.historyLimit) : 12,
    scrollY:number(value.scrollY) && value.scrollY <= 10000000 ? value.scrollY : 0,
    ...(validResume(value.resume,data) ? {resume:value.resume} : {}),
  };
}
export function loadUiState(data: Data, readers: (() => string | null)[]): UiState {
  for (const read of readers) {
    try {
      const raw = read();
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (object(value) && value.version === 1) return restoreUiState(value,data);
      }
    } catch { /* Try the other storage, then defaults. */ }
  }
  return defaultUiState(data);
}
/** A checkpoint must agree with saved answers before it can resume a live session. */
function validResume(value: unknown, data: Data): value is ResumeState {
  if (!object(value) || typeof value.sessionId !== "string" || !number(value.elapsed) || !number(value.savedAt) ||
      !Number.isInteger(value.source) || Number(value.source) < 0 || Number(value.source) > 52 ||
      !Array.isArray(value.recent) || value.recent.length > 10000 || !value.recent.every(position) ||
      !Array.isArray(value.exposures) || value.exposures.length > 52 ||
      !value.exposures.every(x => Array.isArray(x) && x.length === 2 && position(x[0]) && number(x[1]))) return false;
  const session = data.sessions.find(s => s.id === value.sessionId && s.endedAt === null);
  const q = value.question;
  if (!session || !object(q) || typeof q.id !== "string" || !q.id || !position(q.position) ||
      !["card-number","number-card","sequence-forward","sequence-backward"].includes(String(q.direction)) ||
      (!session.focus && !session.benchmark && session.mode !== "mixed" && q.direction !== session.mode) || q.answerFormat !== formatOf(session) ||
      !number(q.elapsed) || q.elapsed > value.elapsed || !Number.isInteger(q.wrong) || Number(q.wrong) < 0 ||
      typeof q.lastIncorrect !== "string" || q.lastIncorrect.length > 100 ||
      !["hint","revealed","interrupted","done","exposed"].every(k => typeof q[k] === "boolean") ||
      !(q.firstCorrect === null || typeof q.firstCorrect === "boolean") ||
      !(q.firstMs === null || number(q.firstMs) && q.firstMs <= q.elapsed) ||
      (q.firstCorrect === null) !== (q.firstMs === null) ||
      !Array.isArray(q.options) || !q.options.every(position) || new Set(q.options).size !== q.options.length ||
      !Array.isArray(q.selected) || !q.selected.every(position) || new Set(q.selected).size !== q.selected.length ||
      q.selected.length !== q.wrong || q.selected.includes(q.position) ||
      !object(q.input) || typeof q.input.digits !== "string" || !/^\d{0,2}$/.test(q.input.digits) ||
      typeof q.input.rank !== "string" || q.input.rank !== "" && !(q.input.rank.length === 1 && RANKS.includes(q.input.rank)) ||
      typeof q.input.suit !== "string" || q.input.suit !== "" && !Object.hasOwn(SUITS,q.input.suit) ||
      q.done !== q.revealed || q.firstCorrect === true) return false;
  if (q.answerFormat === "multiple-choice" ? q.options.length !== 5 || !q.options.includes(q.position) : q.options.length !== 0) return false;
  if(q.submissions!==undefined && (!validSubmissions(q.submissions) || q.submissions.length!==q.selected.length || q.submissions.some((s,i)=>s.position!==(q.selected as number[])[i])))return false;
  const answers = data.attempts.filter(a => a.sessionId === session.id);
  const attempt = answers.find(a => a.id === q.id);
  if (q.firstCorrect === null) {
    if (attempt || q.wrong !== 0 || q.revealed) return false;
  } else if (!attempt || attempt.position !== q.position || attempt.direction !== q.direction ||
      attempt.firstCorrect !== q.firstCorrect || attempt.elapsedMs !== q.firstMs || attempt.wrong !== q.wrong ||
      attempt.hint !== q.hint || attempt.revealed !== q.revealed || attempt.interrupted && !q.interrupted ||
      attempt.recentExposure !== q.exposed) return false;
  if(attempt && JSON.stringify(attempt.submissions)!==JSON.stringify(q.submissions))return false;
  if (answers.some(a => a.id !== q.id && a.at > Number(value.savedAt)) || value.savedAt < session.startedAt) return false;
  if (session.focus) {
    const completed=answers.filter(a=>a.id!==q.id).length,expected=focusPrompt(session.focus,completed);
    if(completed>=session.focus.target||q.position!==expected.position||q.direction!==expected.direction||value.elapsed<session.focus.elapsedMs)return false;
  } else if(session.benchmark){
    const completed=answers.filter(a=>a.id!==q.id).length,expected=session.benchmark.mappings[completed];
    if(!expected || expected.position!==q.position || expected.direction!==q.direction || value.elapsed<session.benchmark.elapsedMs)return false;
  } else if (session.runTarget) {
    const previous = answers.filter(a => a.id !== q.id);
    const expected = previous.length ? ((previous.at(-1)!.position-1+(session.mode === "sequence-forward" ? 1 : -1)+52)%52)+1 : session.startPosition;
    if (q.position !== expected || value.source !== (previous.at(-1)?.position ?? 0) ||
        previous.length >= 52 || value.elapsed < (session.elapsedMs ?? 0)) return false;
  } else if (isSequence(String(q.direction))) return false;
  return true;
}
