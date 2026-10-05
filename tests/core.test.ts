import { cardName } from "../src/core";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STACK,
  emptyData,
  choices,
  choose,
  record,
  summary,
  validate,
  key,
  type Attempt,
  type Direction,
} from "../src/core";
import { cardImage } from "../src/cards";
const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  id: "attempt-1",
  sessionId: "session-1",
  position: 22,
  direction: "card-number",
  at: 100000000,
  firstCorrect: true,
  wrong: 0,
  hint: false,
  revealed: false,
  elapsedMs: 2000,
  interrupted: false,
  recentExposure: false,
  ...extra,
});
test("all 52 canonical Mnemonica mappings are unique and intact", () => {
  const expected = [
    "4C",
    "2H",
    "7D",
    "3C",
    "4H",
    "6D",
    "AS",
    "5H",
    "9S",
    "2S",
    "QH",
    "3D",
    "QC",
    "8H",
    "6S",
    "5S",
    "9H",
    "KC",
    "2D",
    "JH",
    "3S",
    "8S",
    "6H",
    "TC",
    "5D",
    "KD",
    "2C",
    "3H",
    "8D",
    "5C",
    "KS",
    "JD",
    "8C",
    "TS",
    "KH",
    "JC",
    "7S",
    "TH",
    "AD",
    "4S",
    "7H",
    "4D",
    "AC",
    "9C",
    "JS",
    "QD",
    "7C",
    "QS",
    "TD",
    "6C",
    "AH",
    "9D",
  ];
  assert.deepEqual(STACK, expected);
  assert.equal(new Set(STACK).size, 52);
});
test("five distinct choices always include the answer and numeric choices are ascending", () => {
  for (let p = 1; p <= 52; p++)
    for (const dir of ["card-number", "number-card"] as Direction[]) {
      const options = choices(p, dir);
      assert.equal(options.length, 5);
      assert.equal(new Set(options).size, 5);
      assert.ok(options.includes(p));
      if (dir === "card-number")
        assert.deepEqual(
          options,
          [...options].sort((a, b) => a - b),
        );
    }
});
test("first wrong then corrected remains a failure and the inverse direction stays independent", () => {
  const d = emptyData();
  record(d, attempt({ firstCorrect: false, wrong: 2 }));
  assert.equal(summary(d.attempts).accuracy, 0);
  assert.equal(d.memory[key(22, "card-number")].failures, 1);
  assert.equal(d.memory[key(22, "number-card")], undefined);
  assert.ok(d.memory[key(22, "card-number")].intervalDays < 1);
});
test("hint and reveal never earn independent recall credit", () => {
  for (const extra of [{ hint: true }, { revealed: true }]) {
    const d = emptyData();
    record(d, attempt(extra));
    assert.equal(summary(d.attempts).correct, 0);
    assert.equal(d.memory[key(22, "card-number")].successes, 0);
  }
});
test("speed keeps retention credit but adds fluency priority", () => {
  const d = emptyData();
  record(d, attempt({ elapsedMs: 9000 }));
  assert.equal(d.memory[key(22, "card-number")].successes, 1);
  assert.equal(d.memory[key(22, "card-number")].slow, 1);
  assert.equal(summary(d.attempts).correct, 1);
});
test("interrupted timing is excluded, recent exposure cannot grow an existing interval", () => {
  const d = emptyData();
  record(d, attempt({ elapsedMs: null, interrupted: true }));
  assert.equal(summary(d.attempts).medianMs, null);
  const initial = d.memory[key(22, "card-number")].intervalDays;
  record(d, attempt({ id: "2", recentExposure: true }));
  assert.equal(d.memory[key(22, "card-number")].intervalDays, initial);
  assert.equal(d.memory[key(22, "card-number")].successes, 1);
});
test("scheduler avoids the last four prompts and gives weak cards more probability", () => {
  const d = emptyData();
  for (let p = 1; p <= 52; p++)
    d.memory[key(p, "card-number")] = {
      due: 200000000,
      intervalDays: 1,
      successes: 2,
      failures: 0,
      slow: 0,
    };
  record(d, attempt({ firstCorrect: false, wrong: 1 }));
  let weak = 0,
    stable = 0;
  for (let i = 0; i < 10000; i++) {
    const p = choose(
      d,
      "card-number",
      [1, 2, 3, 4],
      100000001,
      () => i / 10000,
    );
    assert.ok(![1, 2, 3, 4].includes(p));
    if (p === 22) weak++;
    if (p === 21) stable++;
  }
  assert.ok(weak > stable * 2.8);
});
test("record is idempotent and valid backups round-trip", () => {
  const d = emptyData();
  d.sessions.push({
    id: "session-1",
    startedAt: 100,
    endedAt: 200,
    mode: "card-number",
    duration: 300000,
  });
  record(d, attempt());
  record(d, attempt());
  assert.equal(d.attempts.length, 1);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(d))), d);
});
test("damaged backups cannot overwrite progress", () => {
  const d = emptyData();
  assert.throws(() =>
    validate({ ...d, settings: { ...d.settings, minutes: -1 } }),
  );
  assert.throws(() =>
    validate({ ...d, attempts: [attempt({ position: 53 })] }),
  );
  assert.throws(() => validate({ ...d, memory: { "__proto__:1": {} } }));
});
test("licensed card images cover all 52 cards with accessible names", () => {
  for (let i = 1; i <= 52; i++) {
    const image = cardImage(i);
    assert.ok(image.includes(`alt="${cardName(i)}"`));
    const path = image.match(/src="([^" ]+)"/)![1];
    const svg = readFileSync(new URL(`../public${path}`, import.meta.url), "utf8");
    assert.ok(svg.includes("<svg"));
    assert.ok(!/<script|https?:\/\/[^" ]+\.(png|jpg)/i.test(svg));
  }
});
