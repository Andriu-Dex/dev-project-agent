import {spawn} from 'node:child_process';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required.');
const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','apps/server/src/modules/reports/reports.integration.test.ts'],{stdio:'inherit',env:{...process.env,RUN_REPORTS_DB_TESTS:'true'}});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
