import {test} from "node:test";
import assert from "node:assert/strict";
import {emptyData, record, updateAttempt, median, percentile, timingEligible, mappingModel, practiceWeights, choose, key,
  mixedDirection, recentlyExposed, validate, summary, deleteSession, restoreSession, type Attempt, type Data} from "../src/core";
import {cardRanking, mappingInsights, directionComparison} from "../src/reporting";

const DAY = 86400000;
const now = 50 * DAY;
const answer = (extra: Partial<Attempt> = {}): Attempt => ({id:"a",sessionId:"s",position:31,direction:"card-number",at:now,
  firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false,...extra});
const history = (count: number, extra: Partial<Attempt> = {}) => Array.from({length:count},(_,i) => answer({id:`a${i}`,at:now-(count-i)*60001,...extra}));
function dataWith(attempts: Attempt[]): Data {
  const d = emptyData();
  d.sessions = [{id:"s",startedAt:1,endedAt:now,mode:"mixed",duration:300000}];
  [...attempts].sort((a,b) => a.at-b.at).forEach(a => record(d,a));
  return d;
}

test("median and interpolated P75 are robust and do not mutate raw observations", () => {
  const input = [6800,900,1100,1000,1200];
  assert.equal(median([]),null); assert.equal(median([9,1]),5);
  assert.equal(median(input),1100); assert.equal(percentile(input,0.75),1200);
  assert.deepEqual(input,[6800,900,1100,1000,1200]);
});
test("one timing rule covers misses, hints, reveals, exposure, interruptions and implausible times", () => {
  assert.equal(timingEligible(answer()),true);
  for (const extra of [{firstCorrect:false},{hint:true},{revealed:true},{recentExposure:true},{interrupted:true},
    {elapsedMs:null},{elapsedMs:0},{elapsedMs:120001},{elapsedMs:Infinity},{elapsedMs:NaN}])
    assert.equal(timingEligible(answer(extra)),false);
  assert.equal(timingEligible(answer({elapsedMs:120000})),true);
  assert.equal(timingEligible(answer({elapsedMs:25000})),true);
});
test("timing exclusions keep raw time and independent correctness without speed credit", () => {
  const attempts = [answer({id:"valid"}),answer({id:"pause",elapsedMs:500000,interrupted:true}),
    answer({id:"outlier",elapsedMs:800000}),answer({id:"hint",hint:true}),answer({id:"exposed",recentExposure:true})];
  const d = dataWith(attempts), stats = summary(d.attempts);
  assert.equal(stats.medianMs,1000); assert.equal(stats.timedCount,1); assert.equal(stats.accuracy,75);
  assert.equal(stats.timingExcluded,2); assert.equal(d.attempts.length,5);
  assert.equal(d.attempts.find(a => a.id === "pause")!.elapsedMs,500000);
  assert.equal(validate(d).attempts.find(a => a.id === "outlier")!.elapsedMs,800000);
});
test("interruption and exposure cannot increment or erase accumulated slow priority", () => {
  const d = dataWith([answer({id:"slow",elapsedMs:9000,at:now-100000})]);
  const before = {...d.memory[key(31,"card-number")]};
  record(d,answer({id:"interrupted",interrupted:true,elapsedMs:1000000}));
  assert.equal(d.memory[key(31,"card-number")].slow,before.slow);
  record(d,answer({id:"exposed",recentExposure:true,elapsedMs:1000}));
  assert.equal(d.memory[key(31,"card-number")].slow,before.slow);
  assert.equal(d.memory[key(31,"card-number")].intervalDays,before.intervalDays*1.35);
});
test("correction, reveal and unresolved outcomes never change first-answer evidence", () => {
  const d = dataWith([answer({firstCorrect:false,wrong:1,elapsedMs:2200,finalResult:"unresolved"})]);
  const schedule = {...d.memory[key(31,"card-number")]};
  updateAttempt(d,answer({firstCorrect:true,wrong:2,elapsedMs:9999,finalResult:"corrected",finalElapsedMs:6000}));
  assert.equal(d.attempts.length,1); assert.equal(d.attempts[0].firstCorrect,false);
  assert.equal(d.attempts[0].elapsedMs,2200); assert.equal(d.attempts[0].finalResult,"corrected");
  assert.equal(d.attempts[0].finalElapsedMs,6000); assert.equal(summary(d.attempts).accuracy,0);
  assert.deepEqual(d.memory[key(31,"card-number")],schedule);
  updateAttempt(d,answer({revealed:true,wrong:2,finalResult:"revealed",finalElapsedMs:6500}));
  assert.equal(d.attempts[0].revealed,true); assert.equal(timingEligible(d.attempts[0]),false);
  assert.deepEqual(validate(d),d);
});
test("old backups retain missing outcomes and missing times as unknown, including deleted history", () => {
  const d = dataWith([answer({elapsedMs:null,interrupted:true})]);
  const legacy = JSON.stringify(d); const restored = validate(JSON.parse(legacy));
  assert.equal(JSON.stringify(restored),legacy); assert.equal(restored.attempts[0].finalResult,undefined);
  assert.equal(deleteSession(restored,"s"),true); assert.equal(validate(restored).deletedSessions![0].attempts[0].elapsedMs,null);
  assert.equal(restoreSession(restored,"s"),true); assert.equal(JSON.stringify(restored),legacy);
  for (const extra of [{finalResult:"invented"},{finalElapsedMs:-1},{finalElapsedMs:2000},{finalResult:"unresolved",finalElapsedMs:2000}])
    assert.throws(() => validate({...d,attempts:[{...d.attempts[0],...extra}]}));
});
test("mastery, samples and scheduling remain independent for both directions and sequence skills", () => {
  const c = history(12), n = history(12,{direction:"number-card",elapsedMs:8000}).map(a => ({...a,id:`n${a.id}`}));
  const seq = history(30,{direction:"sequence-forward",firstCorrect:false}).map(a => ({...a,id:`s${a.id}`}));
  const d = dataWith([...c,...n,...seq]);
  const card = mappingModel(d.attempts,31,"card-number",3,now), number = mappingModel(d.attempts,31,"number-card",3,now);
  assert.equal(card.category,"Automatic"); assert.equal(number.category,"Searching");
  assert.equal(card.lifetime.total,12); assert.equal(number.recent.medianMs,8000);
  assert.ok(card.score > number.score+25);
  assert.equal(d.memory[key(31,"card-number")].slow,0); assert.equal(d.memory[key(31,"number-card")].slow,5);
});
test("recall categories follow the configurable target and require evidence for automaticity", () => {
  const classify = (ms: number, target = 3) => mappingModel(history(12,{elapsedMs:ms}),31,"card-number",target,now).category;
  assert.equal(classify(1500),"Automatic"); assert.equal(classify(1501),"Fast");
  assert.equal(classify(3000),"Fast"); assert.equal(classify(3001),"Calculated");
  assert.equal(classify(6000),"Calculated"); assert.equal(classify(6001),"Searching");
  assert.equal(classify(2000,5),"Automatic");
  assert.equal(mappingModel(history(1),31,"card-number").category,"Building");
  assert.equal(mappingModel([],31,"card-number").category,"Unseen");
  assert.equal(mappingModel(history(12,{interrupted:true}),31,"card-number").category,"Untimed");
  const scantTiming = [...history(12,{interrupted:true}),answer({id:"one-timed"})];
  const scant = mappingModel(scantTiming,31,"card-number",3,now);
  assert.ok(scant.score < 90); assert.equal(scant.timingConfidence,0.2);
  assert.ok(practiceWeights(dataWith(scantTiming),"card-number",[],now+60001).find(p => p.position===31)!.weight > 2);
});
test("recent regression outranks large good history while one slip stays proportional", () => {
  const old = history(80).map((a,i) => ({...a,at:now-20*DAY+i}));
  const missed = history(8,{firstCorrect:false,wrong:1}).map(a => ({...a,id:`m${a.id}`}));
  const regressed = mappingModel([...old,...missed],31,"card-number",3,now);
  const steady = mappingModel(old,31,"card-number",3,now);
  const slip = mappingModel([...old,answer({id:"slip",firstCorrect:false,wrong:1})],31,"card-number",3,now);
  assert.ok(regressed.lifetime.accuracy > 90); assert.ok(regressed.weightedAccuracy < 0.5);
  assert.equal(regressed.category,"Needs work"); assert.ok(regressed.score < steady.score-35);
  assert.ok(slip.score > 70); assert.notEqual(slip.category,"Needs work");
  assert.equal(regressed.recent.eligibleTotal,12); assert.equal(regressed.lifetime.total,88);
  assert.ok(mappingModel([...old,...missed].reverse(),31,"card-number",3,now).score === regressed.score);
  const oldFailures = old.map(a => ({...a,firstCorrect:false,wrong:1}));
  const recovered = mappingModel([...oldFailures,...history(12).map(a => ({...a,id:`new${a.id}`}))],31,"card-number",3,now);
  assert.equal(recovered.category,"Automatic"); assert.ok(recovered.score>90);
});
test("newer errors weigh more than older errors, and hints/reveals have failure pressure", () => {
  const recentGood = history(12).map((a,i) => ({...a,firstCorrect:i>=4,wrong:i>=4?0:1}));
  const recentBad = history(12).map((a,i) => ({...a,firstCorrect:i<8,wrong:i<8?0:1}));
  const good = mappingModel(recentGood,31,"card-number"), bad = mappingModel(recentBad,31,"card-number");
  assert.equal(good.lifetime.accuracy,bad.lifetime.accuracy); assert.ok(good.score > bad.score+15);
  for (const extra of [{hint:true},{revealed:true}]) {
    const model = mappingModel(history(12,extra),31,"card-number");
    assert.equal(model.score,0); assert.equal(model.recentAssists,12); assert.equal(model.recent.timedCount,0);
  }
  const exposedMiss = mappingModel([answer({firstCorrect:false,wrong:1,recentExposure:true})],31,"card-number");
  assert.equal(exposedMiss.lifetime.eligibleTotal,0); assert.ok(exposedMiss.errorPressure>0);
});
test("distribution distinguishes occasional searching from steady moderate recall", () => {
  const variable = mappingModel([900,1100,1000,6800,1200].map((ms,i) => answer({id:String(i),at:now+i,elapsedMs:ms})),31,"card-number");
  const steady = mappingModel(history(5,{elapsedMs:2200}),31,"card-number");
  assert.equal(variable.recent.medianMs,1100); assert.equal(variable.p75Ms,1200);
  assert.equal(variable.consistency,"Variable"); assert.equal(variable.lapseRate,0.2);
  assert.equal(steady.consistency,"Steady"); assert.equal(steady.lapseRate,0);
  assert.notEqual(variable.category,"Automatic");
  assert.equal(mappingModel(history(2),31,"card-number").consistency,"Few timed samples");
});
test("weak-card sorting reflects directional misses, speed, mastery and position", () => {
  const a = [...history(12,{position:1}),...history(12,{position:2,elapsedMs:9000}).map(a => ({...a,id:`slow${a.id}`})),
    ...history(12,{position:3,firstCorrect:false,wrong:1}).map(a => ({...a,id:`miss${a.id}`})),
    ...history(12,{position:2,direction:"number-card"}).map(a => ({...a,id:`n${a.id}`}))];
  assert.equal(cardRanking(a,"card-number",3,"mastery")[0].position,3);
  assert.equal(cardRanking(a,"card-number",3,"speed")[0].position,2);
  assert.equal(cardRanking(a,"card-number",3,"accuracy")[0].position,3);
  assert.equal(cardRanking(a,"all",3,"speed")[0].weakest.direction,"card-number");
  assert.equal(cardRanking(a,"all",3,"misses")[0].position,3);
  assert.deepEqual(cardRanking(a,"all",3,"position").map(r => r.position),Array.from({length:52},(_,i) => i+1));
});
test("selection gives slow, failed, uncertain and stale mappings more weight, with speed opt-out", () => {
  const all = Array.from({length:52},(_,i) => history(12,{position:i+1}).map(a => ({...a,id:`${i}-${a.id}`}))).flat();
  const d = dataWith(all);
  const weight = (p: number) => practiceWeights(d,"card-number",[],now).find(m => m.position===p)!.weight;
  const fluent = weight(1);
  for(const a of d.attempts.filter(a => a.position===2)) a.elapsedMs=8000;
  assert.ok(weight(2)>fluent*2);
  d.settings.speedAdaptive=false; assert.ok(Math.abs(weight(2)-fluent)<0.1);
  d.settings.speedAdaptive=true;
  d.attempts.push(answer({id:"error",position:3,firstCorrect:false,wrong:1,at:now-60001}));
  assert.ok(weight(3)>fluent);
  for(const a of d.attempts.filter(a => a.position===4)) a.at-=20*DAY;
  assert.ok(weight(4)>fluent+1.5);
  d.attempts = d.attempts.filter(a => a.position!==5);
  assert.ok(weight(5)>fluent);
  const pool = practiceWeights(d,"card-number",[1,2,3,4],now);
  assert.ok(pool.every(p => ![1,2,3,4].includes(p.position) && p.weight>0));
});
test("coverage protection survives adversarial draws and respects cooldown", () => {
  const d = emptyData(); let recent: number[] = []; const seen = new Set<number>();
  for(let i=0;i<260;i++) {
    const p = choose(d,"card-number",recent,now+i*60001,() => 0);
    assert.ok(!recent.slice(-4).includes(p)); seen.add(p); recent.push(p);
    record(d,answer({id:String(i),position:p,at:now+i*60001}));
  }
  assert.equal(seen.size,52);
  assert.equal(d.attempts.some(a => a.direction==="number-card"),false);
  assert.equal(mixedDirection(history(6),() => 0),"number-card");
  assert.equal(mixedDirection(history(6,{direction:"number-card"}),() => 1),"card-number");
});
test("exposure expires after a minute instead of invalidating every session repeat", () => {
  const exposures = new Map([[31,now]]);
  assert.equal(recentlyExposed(31,exposures,now+59999),true);
  assert.equal(recentlyExposed(31,exposures,now+60000),false);
  assert.equal(recentlyExposed(1,exposures,now),false);
});
test("focus insights explain slow mappings and concentrated recent misses with small-sample safeguards", () => {
  const a = [...history(12,{position:1,elapsedMs:8000}), ...history(12,{position:2,firstCorrect:false,wrong:1}).map(a => ({...a,id:`m${a.id}`}))];
  const insight = mappingInsights(a,3,"card-number");
  assert.equal(insight.slowMappings,1); assert.equal(insight.concentratedMappings,1); assert.equal(insight.recentMisses,12);
  assert.equal(mappingInsights(a,3,"number-card").slowMappings,0);
  assert.equal(mappingInsights(history(1,{elapsedMs:8000}),3).slowMappings,0);
  const comparison = directionComparison([...a,...history(12,{direction:"number-card",elapsedMs:300000})]);
  assert.equal(comparison.number.timedCount,0);
});
