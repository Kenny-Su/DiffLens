import { mkdir, writeFile } from 'node:fs/promises';
import { audit, model } from '../server/model.js';
import { validateAssessment } from '../server/fidelity.js';
import { AUDIT_PROMPT_VERSION, needsAttention } from '../shared/fidelity.js';
import { fidelityCases, caseRun } from './fidelity-cases.js';

const results = [];
for (const item of fidelityCases) {
  const { run, final } = caseRun(item);
  try {
    const assessments = validateAssessment(await audit(run, final), run, final);
    const predictedConcern = assessments.some(needsAttention);
    const requestGap = assessments.some(row => row.kind === 'request' && ['partial', 'unfulfilled'].includes(row.outcome));
    const pass = predictedConcern === item.concern && (!item.requestGap || requestGap);
    results.push({ id: item.id, expectedConcern: item.concern, predictedConcern, expectedRequestGap: item.requestGap ?? false, requestGap, pass, assessments });
    console.log(`${pass ? 'PASS' : 'MISS'} ${item.id}`);
  } catch (error) {
    results.push({ id: item.id, expectedConcern: item.concern, pass: false, error: (error as Error).message });
    console.log(`ERROR ${item.id}: ${(error as Error).message}`);
  }
}
const completed = results.filter(result => result.predictedConcern !== undefined);
const confusion = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
for (const item of completed) {
  if (item.expectedConcern) item.predictedConcern ? confusion.truePositive++ : confusion.falseNegative++;
  else item.predictedConcern ? confusion.falsePositive++ : confusion.trueNegative++;
}
const report = { model, promptVersion: AUDIT_PROMPT_VERSION, createdAt: new Date().toISOString(), note: 'Small hand-labeled synthetic smoke evaluation, not a calibrated research benchmark. Reports any-finding detection per revision; detailed assessments support inspection.', passed: results.filter(result => result.pass).length, total: results.length, completed: completed.length, confusion, results };
await mkdir('data', { recursive: true });
await writeFile('data/fidelity-evaluation.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, total: report.total, completed: report.completed, confusion }));
if (results.some(result => !result.pass)) process.exitCode = 1;
