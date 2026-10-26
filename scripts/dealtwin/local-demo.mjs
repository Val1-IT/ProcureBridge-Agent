import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
process.env.DATABASE_URL??='postgres://dealtwin_app_login:dealtwin_app_login@127.0.0.1:55632/dealtwin_test';
process.env.DEALTWIN_JUDGE_RESET_DATABASE_URL??='postgres://dealtwin_reset_login:dealtwin_reset_login@127.0.0.1:55632/dealtwin_test';
process.env.DATABASE_SSL_MODE='disable';
process.env.DEALTWIN_JUDGE_SESSION_SIGNING_KEY??=randomBytes(48).toString('base64url');
// Fresh per run and printed only here: the launch route swaps it for a local judge session.
process.env.DEALTWIN_JUDGE_LAUNCH_TOKEN=randomBytes(32).toString('base64url');
const setup=spawnSync(process.execPath,['node_modules/vite-node/vite-node.mjs','--config','vitest.config.ts','scripts/dealtwin/session-bootstrap.ts'],{stdio:'inherit',windowsHide:true,env:process.env});
if(setup.error||setup.status!==0)process.exit(setup.status??1);
await import('./node-server.mjs');
const launch=role=>`http://127.0.0.1:4177/api/dealtwin/judge/launch?role=${role}&token=${process.env.DEALTWIN_JUDGE_LAUNCH_TOKEN}`;
console.log('\nOpen DealTwin Voice (sales admin):\n  '+launch('admin')+'\nApprove the deal as the separate finance approver (second browser profile or private window):\n  '+launch('approver')+'\n');
