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