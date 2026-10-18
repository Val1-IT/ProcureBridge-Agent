import {defineConfig} from '@playwright/test';
import {randomBytes} from 'node:crypto';
import {assertDisposableJudgeDatabaseUrl} from './lib/server/postgres/config';
process.env.DATABASE_URL??='postgres://dealtwin_app_login:dealtwin_app_login@127.0.0.1:55632/dealtwin_test';
process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL??='postgres://dealtwin_reset_login:dealtwin_reset_login@127.0.0.1:55632/dealtwin_test';
process.env.DATABASE_SSL_MODE='disable';
process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY??=randomBytes(48).toString('base64url');
for(const url of [process.env.DATABASE_URL,process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL])assertDisposableJudgeDatabaseUrl(url);
export default defineConfig({
 testDir:'tests/dealtwin/e2e',testMatch:'judge-mode.spec.ts',fullyParallel:false,workers:1,retries:0,maxFailures:1,
 timeout:90000,expect:{timeout:10000},reporter:'list',outputDir:'output/playwright/task24/results',
 globalSetup:'./tests/dealtwin/e2e/setup.ts',
 // Playwright otherwise supplies --no-sandbox. Keep sandboxing mandatory; an
 // unsupported runtime must fail instead of weakening browser isolation.
 use:{baseURL:'http://127.0.0.1:4177',browserName:'chromium',launchOptions:{chromiumSandbox:true},trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/dealtwin/local-demo.mjs',url:'http://127.0.0.1:4177/dealtwin',reuseExistingServer:false,timeout:120000,
  env:{DATABASE_URL:process.env.DATABASE_URL,DATABASE_SSL_MODE:'disable',DEALTWIN_JUDGE_RESET_DATABASE_URL:process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL,DEALTWIN_JUDGE_SESSION_SIGNING_KEY:process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY}},
});
