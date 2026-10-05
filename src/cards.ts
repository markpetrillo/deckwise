import { STACK, cardName } from "./core";
const glyph: Record<string, string> = { C: "♣", D: "♦", H: "♥", S: "♠" };
export function cardSvg(position: number): string {
  const [rank, suit] = STACK[position - 1],
    r = rank === "T" ? "10" : rank,
    color = "DH".includes(suit) ? "#b73743" : "#202f2d",
    symbol = glyph[suit];
  const n = Number(rank === "T" ? 10 : rank);
  let center = "";
  if (Number.isFinite(n)) {
    const pip = (x: number, y: number, flip = false) =>
      `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="49" ${flip ? `transform="rotate(180 ${x} ${y})"` : ""}>${symbol}</text>`;
    const layouts: Record<number, [number, number, boolean?][]> = {
      2: [
        [120, 74],
        [120, 262, true],
      ],
      3: [
        [120, 74],
        [120, 168],
        [120, 262, true],
      ],
      4: [
        [68, 74],
        [172, 74],
        [68, 262, true],
        [172, 262, true],
      ],
      5: [
        [68, 74],
        [172, 74],
        [120, 168],
        [68, 262, true],
        [172, 262, true],
      ],
      6: [
        [68, 74],
        [172, 74],
        [68, 168],
        [172, 168],
        [68, 262, true],
        [172, 262, true],
      ],
      7: [
        [68, 74],
        [172, 74],
        [120, 121],
        [68, 168],
        [172, 168],
        [68, 262, true],
        [172, 262, true],
      ],
      8: [
        [68, 74],
        [172, 74],
        [120, 121],
        [68, 168],
        [172, 168],
        [120, 215, true],
        [68, 262, true],
        [172, 262, true],
      ],
      9: [
        [68, 65],
        [172, 65],
        [68, 133],
        [172, 133],
        [120, 168],
        [68, 203, true],
        [172, 203, true],
        [68, 271, true],
        [172, 271, true],
      ],
      10: [
        [68, 65],
        [172, 65],
        [120, 100],
        [68, 133],
        [172, 133],
        [68, 203, true],
        [172, 203, true],
        [120, 236, true],
        [68, 271, true],
        [172, 271, true],
      ],
    };
    center = (layouts[n] ?? []).map(([x, y, f]) => pip(x, y, f)).join("");
  } else if (rank === "A")
    center = `<text x="120" y="175" text-anchor="middle" dominant-baseline="central" font-size="112">${symbol}</text>`;
  else
    center = `<rect x="49" y="55" width="142" height="226" rx="3" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M72 100L84 76L104 96L120 72L136 96L156 76L168 100V111H72Z" fill="${color}"/><text x="120" y="166" text-anchor="middle" dominant-baseline="central" font-size="75" font-family="Georgia,serif">${r}</text><text x="120" y="236" text-anchor="middle" dominant-baseline="central" font-size="52">${symbol}</text><path d="M72 100L84 76L104 96L120 72L136 96L156 76L168 100V111H72Z" fill="${color}" transform="rotate(180 120 168)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 336" role="img" aria-label="${cardName(position)}"><rect x="1" y="1" width="238" height="334" rx="13" fill="#fffdf8" stroke="#dad8cd" stroke-width="1.3"/><g fill="${color}" font-family="Georgia,serif"><text x="21" y="33" font-size="28" text-anchor="middle">${r}</text><text x="21" y="58" font-size="25" text-anchor="middle">${symbol}</text>${center}<g transform="rotate(180 120 168)"><text x="21" y="33" font-size="28" text-anchor="middle">${r}</text><text x="21" y="58" font-size="25" text-anchor="middle">${symbol}</text></g></g></svg>`;
}
export function numberCard(n: number): string {
  return `<div class="number-card" role="img" aria-label="Position ${n}"><span class="corner">${n}</span><strong>${n}</strong><span class="corner bottom">${n}</span></div>`;
}
