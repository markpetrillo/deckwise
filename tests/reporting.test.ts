import {test} from "node:test";
import assert from "node:assert/strict";
import {reportEvidence,practiceEvidence} from "../src/reporting";
import {type Attempt,type Direction,type AnswerFormat} from "../src/core";
const DAY=86400000,now=Date.parse("2026-11-08T12:00:00-05:00");
const answer=(id:string,at:number,direction:Direction="card-number",answerFormat?:AnswerFormat):Attempt=>({id,sessionId:id,position:1,direction,at,firstCorrect:true,wrong:0,hint:false,revealed:false,elapsedMs:1000,interrupted:false,recentExposure:false,...(answerFormat?{answerFormat}:{})});
const ids=(a:Attempt[])=>a.map(a=>a.id);

test("report windows include exact rolling boundaries and exclude the preceding millisecond",()=>{
 const history=[answer("now",now),answer("week",now-7*DAY),answer("week-before",now-7*DAY-1),answer("month",now-30*DAY),answer("month-before",now-30*DAY-1)];
 assert.deepEqual(ids(reportEvidence(history,"all","all","7",now)),["now","week"]);
 assert.deepEqual(ids(reportEvidence(history,"all","all","30",now)),["now","week","week-before","month"]);
 assert.deepEqual(ids(reportEvidence(history,"all","all","all",now)),ids(history));
 assert.equal(reportEvidence(history,"all","all","7",now+1).some(a=>a.id==="week"),false);
});

test("date windows intersect quiz, direction and format while retaining older multiple-choice history",()=>{
 const history=[answer("card-direct",now,"card-number","direct-recall"),answer("number-direct",now,"number-card","direct-recall"),answer("old-direct",now-10*DAY,"card-number","direct-recall"),answer("legacy",now-10*DAY),answer("forward",now,"sequence-forward","direct-recall"),answer("backward",now-10*DAY,"sequence-backward","multiple-choice"),answer("ancient",now-40*DAY)];
 assert.deepEqual(ids(reportEvidence(history,"all","direct-recall","7",now)),["card-direct","number-direct"]);
 assert.deepEqual(ids(reportEvidence(history,"card-number","direct-recall","30",now)),["card-direct","old-direct"]);
 assert.deepEqual(ids(reportEvidence(history,"all","multiple-choice","30",now)),["legacy"]);
 assert.deepEqual(ids(reportEvidence(history,"sequence","all","30",now)),["forward","backward"]);
 assert.deepEqual(ids(reportEvidence(history,"sequence-backward","multiple-choice","7",now)),[]);
 assert.deepEqual(ids(reportEvidence(history,"all","all","all",now)),["card-direct","number-direct","old-direct","legacy","ancient"]);
 assert.deepEqual(ids(practiceEvidence(history,"mixed","30",now,"direct-recall")),["card-direct","number-direct","old-direct"]);
 assert.equal(history.length,7);
});

test("timestamps across daylight-saving offset changes use elapsed days rather than date strings",()=>{
 const atBoundary=Date.parse("2026-11-01T12:00:00-05:00"),before=Date.parse("2026-11-01T12:00:00-04:00");
 assert.equal(now-atBoundary,7*DAY);
 assert.deepEqual(ids(reportEvidence([answer("included",atBoundary),answer("older-hour",before)],"all","all","7",now)),["included"]);
});
import {progressTrend, TREND_WINDOW} from "../src/reporting";
import {emptyData,deleteSession,restoreSession,type Session,type Data} from "../src/core";
const trendAt=new Date(2026,9,10,12).getTime();
const generalSession=(id:string,day=0,minutes=1):Session=>({id,startedAt:trendAt+day*DAY,endedAt:trendAt+day*DAY+minutes*60000,mode:"card-number",duration:minutes*60000,answerFormat:"direct-recall"});
const trendAnswers=(session:Session,count:number,extra:Partial<Attempt>={}):Attempt[]=>Array.from({length:count},(_,i)=>({...answer(session.id+i,session.startedAt+i*1000,"card-number","direct-recall"),sessionId:session.id,position:i%20+1,...extra}));

test("general-practice trend excludes focused drills, sequence and missing sessions without changing raw evidence",()=>{
 const general=generalSession("general"),focus={...generalSession("focus",1),focus:{mappings:[{position:1,direction:"card-number" as const}],target:3,elapsedMs:3000,completed:true}},sequence={...generalSession("seq",1),mode:"sequence-forward" as const};
 const regular=trendAnswers(general,30),excluded=[...trendAnswers(focus,3,{firstCorrect:false,wrong:1,position:1}),...trendAnswers(sequence,30,{direction:"sequence-forward"}),...trendAnswers(generalSession("missing"),30)];
 const raw=[...regular,...excluded],before=JSON.stringify(raw);
 assert.deepEqual(progressTrend([general,focus,sequence],raw,"direct-recall"),progressTrend([general],regular,"direct-recall"));
 assert.equal(JSON.stringify(raw),before);
});

test("short sessions pool answers by day, with answer-weighted medians rather than session averages",()=>{
 const quick=generalSession("one-minute",0,1),long=generalSession("two-minute",0,2);
 const raw=[...trendAnswers(quick,20,{elapsedMs:1000}),...trendAnswers(long,1,{elapsedMs:20000})];
 const trend=progressTrend([quick,long],raw,"direct-recall");
 assert.equal(trend.points.length,1);assert.equal(trend.points[0].stats.eligibleTotal,21);assert.equal(trend.points[0].stats.medianMs,1000);
 const combined=generalSession("combined",0,3);
 const joined=progressTrend([combined],raw.map(a=>({...a,sessionId:combined.id})),"direct-recall");
 assert.deepEqual(trend.points,joined.points);
});

test("daily points use the most recent 100 answers and respond proportionally to later regression",()=>{
 const old=generalSession("old"),current=generalSession("current",1),regression=generalSession("regression",2);
 const raw=[...trendAnswers(old,100,{firstCorrect:false,wrong:1}),...trendAnswers(current,100,{elapsedMs:2000}),...trendAnswers(regression,20,{firstCorrect:false,wrong:1})];
 const trend=progressTrend([old,current,regression],raw,"direct-recall");
 assert.equal(trend.points.length,3);
 assert.equal(trend.points[1].stats.eligibleTotal,TREND_WINDOW);assert.equal(trend.points[1].stats.accuracy,100);assert.equal(trend.points[1].from,current.startedAt);
 assert.equal(trend.points[2].stats.accuracy,80);assert.equal(trend.points[2].stats.medianMs,2000);
});

test("trend waits for 20 eligible answers across 10 mappings and enough correct timing evidence",()=>{
 const s=generalSession("warmup");
 assert.equal(progressTrend([s],trendAnswers(s,19),"direct-recall").points.length,0);
 assert.equal(progressTrend([s],trendAnswers(s,20).map(a=>({...a,position:1})),"direct-recall").points.length,0);
 assert.equal(progressTrend([s],trendAnswers(s,20).map((a,i)=>({...a,position:i%10+1})),"direct-recall").points.length,1);
 const few=trendAnswers(s,20).map((a,i)=>({...a,firstCorrect:i<4,wrong:i<4?0:1}));
 const point=progressTrend([s],few,"direct-recall").points[0];assert.equal(point.stats.accuracy,20);assert.equal(point.stats.medianMs,null);
 const enough=few.map((a,i)=>i===4?{...a,firstCorrect:true,wrong:0}:a);
 assert.equal(progressTrend([s],enough,"direct-recall").points[0].stats.medianMs,1000);
});

test("recent exposure, hints, reveals, interrupted timing and outliers retain the established rules",()=>{
 const s=generalSession("eligibility"),raw=trendAnswers(s,20,{elapsedMs:2000});
 raw[0].hint=true;raw[1].revealed=true;raw[2].firstCorrect=false;raw[2].wrong=1;
 raw[3].interrupted=true;raw[4].elapsedMs=200001;
 const exposed=trendAnswers(s,5,{recentExposure:true,firstCorrect:false,wrong:1});exposed.forEach(a=>a.id+='exposed');
 const trend=progressTrend([s],[...raw,...exposed],"direct-recall"),point=trend.points[0];
 assert.equal(trend.count,20);assert.equal(point.stats.accuracy,85);assert.equal(point.stats.timedCount,15);assert.equal(point.stats.medianMs,2000);
 assert.equal(raw[4].elapsedMs,200001);
});

test("trend formats and selected date/direction evidence remain separate, including legacy multiple choice",()=>{
 const c=generalSession("card"),n={...generalSession("number"),mode:"number-card" as const},mc={...generalSession("legacy"),answerFormat:undefined};
 const direct=trendAnswers(c,20,{elapsedMs:6000}),number=trendAnswers(n,20,{direction:"number-card",elapsedMs:3000}),legacy=trendAnswers(mc,20,{answerFormat:undefined,elapsedMs:1000});
 const raw=[...direct,...number,...legacy],sessions=[c,n,mc];
 const scoped=reportEvidence(raw,"card-number","all","7",trendAt+DAY);
 assert.equal(progressTrend(sessions,scoped,"direct-recall").points[0].stats.medianMs,6000);
 assert.equal(progressTrend(sessions,scoped,"multiple-choice").points[0].stats.medianMs,1000);
 assert.equal(progressTrend(sessions,reportEvidence(raw,"number-card","direct-recall","7",trendAt+DAY),"direct-recall").points[0].stats.medianMs,3000);
 assert.equal(progressTrend(sessions,reportEvidence(raw,"all","all","7",trendAt+10*DAY),"direct-recall").points.length,0);
});

test("daily snapshots respect local calendar days and display limits retain earlier rolling context",()=>{
 const first=generalSession("morning"),evening={...generalSession("evening"),startedAt:new Date(2026,9,10,23).getTime()},next=generalSession("tomorrow",1);
 const trend=progressTrend([first,evening,next],[...trendAnswers(first,10),...trendAnswers(evening,10),...trendAnswers(next,10)],"direct-recall",1);
 assert.equal(trend.points.length,1);assert.equal(trend.points[0].stats.eligibleTotal,30);assert.equal(trend.points[0].from,first.startedAt);assert.equal(trend.points[0].at,next.startedAt+9000);
});

test("deleting and restoring a general session recomputes the trend without a stored metric migration",()=>{
 const d:Data=emptyData(),s=generalSession("recover");d.sessions=[s];d.attempts=trendAnswers(s,30);
 const before=progressTrend(d.sessions,d.attempts,"direct-recall");
 assert.equal(deleteSession(d,s.id),true);assert.equal(progressTrend(d.sessions,d.attempts,"direct-recall").count,0);
 assert.equal(restoreSession(d,s.id),true);assert.deepEqual(progressTrend(d.sessions,d.attempts,"direct-recall"),before);
});