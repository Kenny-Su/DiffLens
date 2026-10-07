import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { auditWithModel, model } from './model.js';
import type { Run } from '../shared/types.js';

type Comparison = { id: string; original: string; revised: string; humanLabel: string; humanReason: string; confirmedAt: string | null; predictedLabel: string; predictedReason: string };
const divide = (a: number, b: number) => b ? a / b : null;
function metrics(rows: Comparison[]) {
  let tp=0,fp=0,tn=0,fn=0;
  for (const row of rows) {
    const positive=row.humanLabel==='unacceptable', flagged=row.predictedLabel==='unacceptable';
    if(positive && flagged) tp++; else if(positive) fn++; else if(flagged) fp++; else tn++;
  }
  return {count:rows.length,confusionMatrix:{tp,fp,tn,fn},prevalence:divide(tp+fn,rows.length),precision:divide(tp,tp+fp),recall:divide(tp,tp+fn),f1:divide(2*tp,2*tp+fp+fn)};
}
async function evaluate(name: string) {
  const inputPath=resolve('fixtures', `${name}.json`);
  const reportPath=resolve('data', `${name}-evaluation.json`);
  if(!existsSync(inputPath)) throw new Error(`Add a local annotated revision export at fixtures/${name}.json. Evaluation inputs are not included in Git.`);
  const fixture=JSON.parse(readFileSync(inputPath,'utf8'));
  if(fixture.edits.some((e:any)=>!['acceptable','unacceptable'].includes(e.label))) throw new Error(`${name}: missing edit labels`);
  const input:Run={id:randomUUID(),original:fixture.original,revised:fixture.revised,instruction:fixture.instruction,rules:[],mode:'manual',createdAt:new Date().toISOString(),edits:fixture.edits.map((e:any)=>({id:e.id,before:e.before,after:e.after,start:e.start,end:e.end,flag:false,reason:'',decision:'pending',feedback:''})),segments:[],clauses:[]};
  console.log(`${name}: auditing ${input.edits.length} edits; labels withheld`);
  const predicted=await auditWithModel(input);
  const comparisons:Comparison[]=fixture.edits.map((human:any)=>{const p=predicted.edits.find(e=>e.id===human.id)!;return {id:human.id,original:human.before,revised:human.after,humanLabel:human.label,humanReason:human.reason,confirmedAt:human.confirmedAt,predictedLabel:p.flag?'unacceptable':'acceptable',predictedReason:p.reason};});
  const clauseComparisons=fixture.clauses.map((human:any)=>{
    const matches=predicted.clauses.filter(c=>c.kind===human.kind&&c.text.trim().toLowerCase()===human.text.trim().toLowerCase());const p=matches.length===1?matches[0]:null;
    return {text:human.text,kind:human.kind,confirmed:Boolean(fixture.source.clauseConfirmedAt),humanOutcome:human.outcome,predictedOutcome:p?.status??null,outcomeMatches:p?p.status===human.outcome:null,humanEditIds:human.edit_ids,predictedEditIds:p?.editIds??null};
  });
  const report={createdAt:predicted.createdAt,model:predicted.model,source:fixture.source,rules:[],positiveClass:'unacceptable',...metrics(comparisons),confirmedOnly:metrics(comparisons.filter(e=>e.confirmedAt)),draftOnly:metrics(comparisons.filter(e=>!e.confirmedAt)),comparisons,clauseComparisons,predictedClauses:predicted.clauses,limitations:['Small selected sample; not a general performance estimate.','Draft and confirmed label comparisons must be interpreted separately.','Clause outcomes are compared only for exact text matches; unmatched clauses are unscored.']};
  mkdirSync('data',{recursive:true});writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`${name}: completed ${JSON.stringify(report.confusionMatrix)}`);return report;
}
if(process.argv.includes('--all')) {
  if(!existsSync('fixtures')) throw new Error('Add local annotated revision exports to fixtures/ before running an evaluation.');
  const names=readdirSync('fixtures').filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5));
  if(!names.length) throw new Error('No local annotated revision exports found in fixtures/.');
  const reports:any[]=[],errors:{name:string;message:string}[]=[];
  // Three independent passage audits at a time; no extra generation calls.
  for(let i=0;i<names.length;i+=3) {
    const batch=names.slice(i,i+3);const results=await Promise.allSettled(batch.map(evaluate));
    results.forEach((r,j)=>{if(r.status==='fulfilled')reports.push({fixture:batch[j],...r.value});else {errors.push({name:batch[j],message:String(r.reason)});console.error(`${batch[j]}: failed`);}});
  }
  const rows:Comparison[]=reports.flatMap(r=>r.comparisons);
  const summary={createdAt:new Date().toISOString(),model,allLabelsExploratory:metrics(rows),confirmedOnly:metrics(rows.filter(e=>e.confirmedAt)),draftOnly:metrics(rows.filter(e=>!e.confirmedAt)),passages:reports.map(r=>({fixture:r.fixture,title:r.source.title,confirmed:r.confirmedOnly.count,draft:r.draftOnly.count,count:r.count,confusionMatrix:r.confusionMatrix,precision:r.precision,recall:r.recall,f1:r.f1})),errors};
  mkdirSync('data',{recursive:true});writeFileSync('data/evaluation-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));if(errors.length)process.exitCode=1;
} else {
  const name=process.argv[2];
  if(!name) throw new Error('Specify a local export: npm run evaluate:example -- <name>');
  const report=await evaluate(name);console.log(JSON.stringify({count:report.count,confusionMatrix:report.confusionMatrix,precision:report.precision,recall:report.recall,f1:report.f1,report:`data/${name}-evaluation.json`},null,2));
}
