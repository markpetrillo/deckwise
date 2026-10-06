import { cardName } from "../src/core";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STACK,
  sequenceNeighbor,
  sequenceResult,
  emptyData,
  choices,
  choose,
  record,
  deleteSession,
  restoreSession,
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

test("session deletion rebuilds reports and memory using only retained answers", () => {
 const d = emptyData();
 const sessions = ['test-session', 'real-session', 'empty-session'].map((id, i) => ({id, startedAt: i * 100, endedAt: i * 100 + 99, mode: 'card-number' as const, duration: 300000}));
 d.sessions.push(...sessions);
 const testAnswer = attempt({id:'test-answer', sessionId:'test-session', position:22, at:100, firstCorrect:false, wrong:1});
 const realAnswer = attempt({id:'real-answer', sessionId:'real-session', position:22, at:200});
 const otherAnswer = attempt({id:'other-answer', sessionId:'real-session', position:14, at:210});
 [testAnswer, realAnswer, otherAnswer].forEach(a => record(d, a));
 const expected = emptyData();expected.sessions.push(sessions[1], sessions[2]);
 [realAnswer, otherAnswer].forEach(a => record(expected, a));
 assert.ok(deleteSession(d, 'test-session'));
 assert.deepEqual({...d, deletedSessions:undefined}, {...expected, deletedSessions:undefined});
 assert.equal(d.deletedSessions?.[0].attempts[0].id,"test-answer");
 assert.equal(summary(d.attempts).accuracy, 100);
 assert.deepEqual(validate(JSON.parse(JSON.stringify(d))), d);
 const memory = JSON.stringify(d.memory);
 assert.ok(deleteSession(d, 'empty-session'));
 assert.equal(JSON.stringify(d.memory), memory);
 assert.ok(deleteSession(d, 'real-session'));
 assert.deepEqual(d.attempts, []);assert.deepEqual(d.memory, {});assert.deepEqual(d.sessions, []);
});
test("session deletion cannot remove an active or unknown session", () => {
 const d = emptyData();d.sessions.push({id:'active', startedAt:1, endedAt:null, mode:'mixed', duration:300000});
 const before = JSON.stringify(d);
 assert.equal(deleteSession(d, 'active'), false);assert.equal(deleteSession(d, 'missing'), false);
 assert.equal(JSON.stringify(d), before);
});

 test("sequence adjacency wraps correctly and has independent history", () => {
  for (let p=1;p<=52;p++) {
    assert.equal(sequenceNeighbor(p,"sequence-forward"),p===52?1:p+1);
    assert.equal(sequenceNeighbor(p,"sequence-backward"),p===1?52:p-1);
  }
  const d=emptyData();
  d.sessions.push({id:"seq",startedAt:1000,endedAt:2000,mode:"sequence-forward",duration:60000});
  record(d,attempt({id:"seq-a",sessionId:"seq",direction:"sequence-forward"}));
  assert.ok(d.memory[key(22,"sequence-forward")]);
  assert.equal(d.memory[key(22,"card-number")],undefined);
  assert.equal(d.memory[key(22,"sequence-backward")],undefined);
  assert.deepEqual(validate(JSON.parse(JSON.stringify(d))),d);
  assert.equal(deleteSession(d,"seq"),true);
  assert.deepEqual(d.memory,{});
});

test("full-deck scores keep raw time, penalties, accuracy, and completion distinct", () => {
 const s={id:"run",startedAt:1000,endedAt:2000,mode:"sequence-forward" as const,duration:0,runTarget:52,startPosition:1,elapsedMs:120000,completed:true};
 const answers=Array.from({length:52},(_,i)=>attempt({id:String(i),sessionId:"run",position:i+1,direction:"sequence-forward"}));
 assert.deepEqual(sequenceResult(s,answers),{total:52,accuracy:100,penalties:0,penaltyMs:0,elapsedMs:120000,scoredMs:120000,complete:true});
 answers[0].wrong=2;answers[0].firstCorrect=false;answers[1].revealed=true;answers[1].firstCorrect=false;
 const r=sequenceResult(s,answers);assert.equal(r.penalties,3);assert.equal(r.scoredMs,135000);assert.equal(r.accuracy,50/52*100);
 assert.equal(sequenceResult({...s,completed:false},answers).complete,false);
 assert.equal(sequenceResult(s,answers.slice(0,51)).complete,false);
 const d=emptyData();d.sessions=[s];d.attempts=answers;assert.deepEqual(validate(d),d);
 assert.throws(()=>validate({...d,sessions:[{...s,elapsedMs:-1}]}));
});

test("deleted sessions survive backup and restore full chronological evidence", () => {
 const d=emptyData();
 d.sessions=[{id:"s1",startedAt:1,endedAt:2,mode:"card-number",duration:60000},{id:"s2",startedAt:3,endedAt:4,mode:"card-number",duration:180000}];
 record(d,attempt({id:"a1",sessionId:"s1",at:10}));record(d,attempt({id:"a2",sessionId:"s2",at:20,firstCorrect:false,wrong:2}));
 const original=validate(d);assert.equal(deleteSession(d,"s1"),true);assert.equal(deleteSession(d,"s2"),true);
 assert.equal(d.attempts.length,0);assert.deepEqual(d.memory,{});
 const saved=validate(JSON.parse(JSON.stringify(d)));
 assert.equal(restoreSession(saved,"s2"),true);assert.equal(restoreSession(saved,"s1"),true);
 assert.deepEqual(saved,original);assert.equal(restoreSession(saved,"s1"),false);
 assert.equal(deleteSession(saved,"s1"),true);assert.equal(deleteSession(saved,"s1"),false);
 assert.equal(saved.deletedSessions?.length,1);
});
test("damaged and conflicting deleted history is rejected", () => {
 const d=emptyData();d.sessions=[{id:"s",startedAt:1,endedAt:2,mode:"card-number",duration:60000}];record(d,attempt({sessionId:"s"}));deleteSession(d,"s");
 assert.deepEqual(validate(d),d);
 assert.throws(()=>validate({...d,deletedSessions:{}}));
 assert.throws(()=>validate({...d,deletedSessions:[...d.deletedSessions!,...d.deletedSessions!]}));
 assert.throws(()=>validate({...d,sessions:[d.deletedSessions![0].session]}));
 const bad=JSON.parse(JSON.stringify(d));bad.deletedSessions[0].attempts[0].sessionId="missing";assert.throws(()=>validate(bad));
 const active=JSON.parse(JSON.stringify(d));active.deletedSessions[0].session.endedAt=null;assert.throws(()=>validate(active));
});
