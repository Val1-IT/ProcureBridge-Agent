import {randomBytes} from 'node:crypto';
import {bootstrapLocalJudge} from './bootstrap';
// Test-only, explicit synthetic reset BEFORE Playwright starts its preserving
// webServer. No schema drop, migration, external access or public session issuer.
process.env.DATABASE_URL??='postgres://dealtwin_app_login:dealtwin_app_login@127.0.0.1:55632/dealtwin_test';
process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL??='postgres://dealtwin_reset_login:dealtwin_reset_login@127.0.0.1:55632/dealtwin_test';
process.env.DATABASE_SSL_MODE='disable';
process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY??=randomBytes(48).toString('base64url');
await bootstrapLocalJudge(true);
console.log('Disposable synthetic browser fixture prepared; normal demo startup remains preserving.');
