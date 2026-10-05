import { STACK, cardName } from "./core";
export function cardImage(position: number): string {
  const [rank, suit] = STACK[position - 1];
  return `<img class="playing-card" src="/cards/${suit}-${rank === "T" ? "10" : rank}.svg" alt="${cardName(position)}" width="240" height="336" decoding="async" />`;
}
export function numberCard(n: number): string {
  return `<div class="number-card" role="img" aria-label="Position ${n}"><span class="corner">${n}</span><strong>${n}</strong><span class="corner bottom">${n}</span></div>`;
}
