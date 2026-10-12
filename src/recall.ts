import {STACK, RANKS, SUITS, cardName, type Direction} from "./core";

export interface RecallInput {digits: string; rank: string; suit: string}
export type RecallAction = {type:"digit" | "rank" | "suit"; value:string} | {type:"backspace" | "clear"};
export const emptyRecallInput = (): RecallInput => ({digits:"",rank:"",suit:""});
/** Editing a partial answer never grades it. Only Check answer submits. */
export function editRecallInput(input: RecallInput, action: RecallAction): RecallInput {
  if (action.type === "clear") return emptyRecallInput();
  if (action.type === "backspace") return {...input,digits:input.digits.slice(0,-1)};
  if (action.type === "digit") return /^\d$/.test(action.value) && input.digits.length < 2 ? {...input,digits:input.digits+action.value} : input;
  if (action.type === "rank") return action.value.length === 1 && RANKS.includes(action.value) ? {...input,rank:action.value} : input;
  if (action.type === "suit") return Object.hasOwn(SUITS,action.value) ? {...input,suit:action.value} : input;
  return input;
}
export function recallPosition(direction: Direction, input: RecallInput): number | null {
  if (direction === "card-number") {
    if (!/^\d{1,2}$/.test(input.digits)) return null;
    const position = Number(input.digits);
    return position >= 1 && position <= 52 ? position : null;
  }
  if ((direction !== "number-card" && direction !== "sequence-forward" && direction !== "sequence-backward") || input.rank.length !== 1 || !RANKS.includes(input.rank) || !Object.hasOwn(SUITS,input.suit)) return null;
  const index = STACK.indexOf(input.rank+input.suit);
  return index < 0 ? null : index+1;
}
export function recallDisplay(direction: Direction, input: RecallInput): string {
  if (direction === "card-number") return input.digits || "—";
  const position = recallPosition(direction,input);
  return position === null ? (input.rank ? input.rank === "T" ? "10" : input.rank : "Rank") + " + " + (SUITS[input.suit] ?? "suit") : cardName(position);
}
