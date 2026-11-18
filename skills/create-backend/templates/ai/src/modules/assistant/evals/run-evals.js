import 'dotenv/config';
import { parseArgs } from 'node:util';
import { connectDatabases, disconnectDatabases } from '../../../config/databases.js';
import { disconnectRedis } from '../../../config/redis.js';
import { getMeService } from '../../auth/services/auth.service.js';
import { runAssistantTurnService } from '../services/assistant.service.js';
import { EVAL_CASES } from './cases.js';
import { scoreEvalCase } from './score.js';

const write = (line = '') => process.stdout.write(`${line}\n`);

const runCase = async (ctx, evalCase) => {
  try {
    let done = null;
    const input = { message: evalCase.message, history: [] };
    for await (const event of runAssistantTurnService(ctx, input)) {
      if (event.type === 'done') {
        done = event.data;
      }
    }
    return { reply: done?.message ?? '', toolsUsed: done?.toolsUsed ?? [] };
  } catch (error) {
    return { error: error.message };
  }
};

const run = async () => {
  const { values } = parseArgs({ options: { user: { type: 'string' }, only: { type: 'string' } } });
  if (!values.user) {
    write('Usage: npm run eval:assistant -- --user <userId> [--only id,id]');
    process.exitCode = 1;
    return;
  }
  await connectDatabases();
  const profile = await getMeService(values.user);
  const ctx = { user: { id: values.user }, requestId: 'eval' };
  const only = values.only ? new Set(values.only.split(',')) : null;
  const cases = EVAL_CASES.filter((evalCase) => !only || only.has(evalCase.id));
  let failed = 0;

  for (const evalCase of cases) {
    const result = await runCase(ctx, evalCase);
    const failures = scoreEvalCase(evalCase.expect, result, profile);
    failed += failures.length > 0 ? 1 : 0;
    write(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${evalCase.id}`);
    failures.forEach((failure) => write(`     ${failure}`));
  }

  write(`\n${cases.length - failed}/${cases.length} passed`);
  process.exitCode = failed > 0 ? 1 : 0;
};

run()
  .catch((error) => {
    write(`Eval run failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectRedis();
    await disconnectDatabases();
  });
