'use strict';
/**
 * BullMQ worker for deep-diagnostic jobs. Run as its own PM2 process:
 *   pm2 start worker.js --name diag-worker
 * Shares the bridge's env (OPENROUTER_API_KEY, REDIS_*, DIAGNOSTIC_MODEL).
 */
require('dotenv').config();
const { Worker } = require('bullmq');
const IORedis = require('ioredis');
const { QUEUE_NAME, redisOptions, runDeepDiagnostic } = require('./lib/diagnosticQueue');

const concurrency = parseInt(process.env.DIAGNOSTIC_WORKER_CONCURRENCY || '5', 10);

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    console.log(`[diag-worker] processing job ${job.id}`);
    return await runDeepDiagnostic(job.data.payload);
  },
  { connection: new IORedis(redisOptions), concurrency }
);

worker.on('completed', (job) => {
  console.log(`[diag-worker] completed ${job.id} (score ${job.returnvalue?.ai_readiness_score})`);
});
worker.on('failed', (job, err) => {
  console.error(`[diag-worker] failed ${job?.id}: ${err?.message}`);
});

console.log(`[diag-worker] started, queue=${QUEUE_NAME}, concurrency=${concurrency}`);
