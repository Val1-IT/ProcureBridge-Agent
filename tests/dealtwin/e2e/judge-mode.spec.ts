import {test,expect,type Page} from '@playwright/test';
import type {ServerWorkspace} from '../../../lib/dealtwin/ui/workspace';
import {readdirSync} from 'node:fs';
import {bootstrapLocalJudge} from '../../../scripts/dealtwin/bootstrap';
const base='http://127.0.0.1:4177';
type State=ServerWorkspace&{businessSeedHash:string};
async function state(page:Page):Promise<State>{const response=await page.request.get(base+'/api/dealtwin/judge/state');expect(response.status()).toBe(200);return response.json();}
async function ready(page:Page){await expect(page.getByTestId('server-workspace')).toHaveAttribute('aria-busy','false');}
async function act(page:Page,kind:string,status=200){
 const before=await state(page);
 // Task29: every lifecycle command begins from a real browser refresh, not
 // merely a refreshed DTO. Server state must survive unchanged before mutation.
 await page.reload();await ready(page);expect(await state(page)).toEqual(before);
 const wait=page.waitForResponse(response=>response.url().startsWith(base+'/api/dealtwin/')&&['POST','PATCH'].includes(response.request().method()));
 await page.locator('[data-action="'+kind+'"]').click();const response=await wait;expect(response.status()).toBe(status);const body=await response.json();
 await ready(page);const after=await state(page);expect(after.revision).toBe(before.revision+(status===200?1:0));return {body,response,before,after};
}
let canonicalHash:string|undefined;
let lastCommit:{url:string;body:Record<string,unknown>}|undefined;
test('workspace read outage is recoverable without resetting or mutating financial state',async({browser})=>{
 const context=await browser.newContext({storageState:'output/playwright/task24/auth/admin.json'});
 const page=await context.newPage();let mutations=0;
 try{
  const before=await state(page);
  page.on('request',request=>{if(request.url().startsWith(base+'/api/dealtwin/')&&['POST','PATCH','DELETE'].includes(request.method()))mutations++;});
  await context.route('**/api/dealtwin/judge/state',route=>route.abort('failed'));
  await page.goto(base+'/dealtwin');
  await expect(page.getByRole('alert')).toContainText('NETWORK_UNAVAILABLE');
  await expect(page.locator('[data-action]')).toHaveCount(0);
  // A repeated failed read must retain an honest recovery action, never a local success.
  await page.getByRole('button',{name:'Try loading workspace again',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('NETWORK_UNAVAILABLE');
  await context.unroute('**/api/dealtwin/judge/state');
  await page.getByRole('button',{name:'Try loading workspace again',exact:true}).click();
  await ready(page);expect(await state(page)).toEqual(before);expect(mutations).toBe(0);
 }finally{await context.close();}
});
for(const width of [390,1440]){
 test('read-only navigation and tables remain usable at '+width+'px',async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:900},storageState:'output/playwright/task24/auth/admin.json'});
  const page=await context.newPage();
  try{
   await page.goto(base+'/dealtwin');await ready(page);const before=await state(page);
   await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to workspace',exact:true})).toBeFocused();
   await page.keyboard.press('Enter');await expect(page.locator('#dealtwin-main')).toBeFocused();
   for(const [label,path] of [['ERP Sandbox','/dealtwin/erp'],['Commitment Ledger','/dealtwin/commitments']] as const){
    const link=page.getByRole('navigation',{name:'DealTwin workflows'}).getByRole('link',{name:label,exact:true});
    await link.click();await expect(page).toHaveURL(url=>url.pathname===path);await ready(page);
    await expect(link).toHaveAttribute('aria-current','page');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    // Named sections are also implicit regions, but are not scroll controls.
    // Check every actual table's wrapper, including its accessible name.
    const tables=page.getByRole('table');
    if(path==='/dealtwin/erp')await expect(tables).toHaveCount(1);
    for(const table of await tables.all()){
     const region=table.locator('..');
     await expect(region).toHaveAttribute('role','region');
     await expect(region).toHaveAttribute('aria-label',/\S/);
     await expect(region).toHaveAttribute('tabindex','0');
     await region.focus();await expect(region).toBeFocused();
    }
   }
   await page.goBack();await expect(page).toHaveURL(url=>url.pathname==='/dealtwin/erp');await ready(page);
   expect(await state(page)).toEqual(before);
  }finally{await context.close();}
 });
}
test('trusted local bootstrap mints signed sessions without resetting live synthetic state',async({browser})=>{
 const admin=await browser.newContext({storageState:'output/playwright/task24/auth/admin.json'});const page=await admin.newPage();
 try{
  const before=await state(page);const auth=await bootstrapLocalJudge(false);
  const fresh=await browser.newContext({storageState:auth.admin});
  try{expect(await state(await fresh.newPage())).toEqual(before);}finally{await fresh.close();}
  const approver=await browser.newContext({storageState:auth.approver});
  try{const response=await approver.request.get(base+'/api/dealtwin/judge/state');expect(response.status()).toBe(200);expect((await response.json()).actor.role).toBe('approver');}finally{await approver.close();}
  expect(await state(page)).toEqual(before);
 }finally{await admin.close();}
});
test('Node production target serves real hydration assets and denies traversal',async({request})=>{
 const assets=readdirSync('dist/client/assets');
 for(const extension of ['.js','.css']){
  const filename=assets.find(name=>name.endsWith(extension));expect(filename).toBeTruthy();
  const response=await request.get(base+'/assets/'+filename);expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain(extension==='.js'?'javascript':'css');
 }
 expect((await request.get(base+'/assets/..%2F..%2Fpackage.json')).status()).toBe(404);
 expect((await request.get(base+'/assets/..%2F.vite/manifest.json')).status()).toBe(404);
 expect((await request.get(base+'/api/dealtwin/judge/state',{headers:{host:'foreign.example'}})).status()).toBe(421);
 expect((await request.post(base+'/assets/not-a-write')).status()).toBe(405);
});
test('declining an actual reset confirmation emits no mutation request',async({browser})=>{
 const context=await browser.newContext({storageState:'output/playwright/task24/auth/admin.json'});const page=await context.newPage();
 try{
  await page.goto(base+'/dealtwin/judge');await ready(page);const before=await state(page);let resets=0;
  page.on('request',request=>{if(request.url().endsWith('/judge/reset')&&request.method()==='POST')resets++;});
  const dialogWait=page.waitForEvent('dialog',{timeout:3000});
  const click=page.locator('[data-action="reset"]').click();const dialog=await dialogWait;
  expect(dialog.type()).toBe('confirm');await dialog.dismiss();await click;await ready(page);
  expect(await state(page)).toEqual(before);expect(resets).toBe(0);
 }finally{await context.close();}
});
for(const width of [1440,820,1024]){
 test('clean durable Judge journey at '+width+'px',async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:1000},storageState:'output/playwright/task24/auth/admin.json'});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(base+'/dealtwin/judge');await ready(page);
   await expect(page.getByRole('heading',{name:'Judge Mode',exact:true})).toBeVisible();
   const beforeReset=await state(page);
   const dialogWait=page.waitForEvent('dialog',{timeout:3000});const declining=page.locator('[data-action="reset"]').click();
   const dialog=await dialogWait;await dialog.dismiss();await declining;await ready(page);
   await expect(page.getByTestId('workspace-revision')).toHaveText('Revision '+beforeReset.revision);
   expect((await state(page)).revision).toBe(beforeReset.revision);
   page.once('dialog',dialog=>dialog.accept());const reset=await act(page,'reset');
   canonicalHash??=reset.after.businessSeedHash;expect(reset.after.businessSeedHash).toBe(canonicalHash);
   expect(reset.after.cash.openingBalanceRupiah).toBe('30000000');expect(reset.after.proofs).toHaveLength(0);
   const cashBefore=reset.after.erp.cashMovements;const ordersBefore=reset.after.erp.salesOrders.length;
   // B's immutable proof must exist before A occupies capacity, so allocation can diagnose
   // the genuine capacity-only dependency collision rather than inventing a new failed proof.
   await page.goto(base+'/dealtwin/deals/judge-deal-b');await ready(page);
   const alone=await act(page,'compile');expect(alone.body.outcome).toBe('CONDITIONALLY_VALID');await act(page,'proof');
   await page.goto(base+'/dealtwin/judge');await ready(page);
   const initial=await act(page,'compile');expect(initial.body).toMatchObject({outcome:'DOES_NOT_COMPILE',shortfallRupiah:'3000000',firstViolationDate:'2026-09-22'});
   await expect(page.getByTestId('shortfall').first()).toHaveText('Rp3.000.000');
   await act(page,'confirm');const amendment=await act(page,'recompile');
   expect(amendment.body).toMatchObject({outcome:'PROPOSED_AMENDMENT',minimumProjectedBalanceRupiah:'5000000'});
   await expect(page.getByTestId('current-deposit')).toHaveText('2500 basis points');
   const stress=await act(page,'delay3');expect(stress.body).toMatchObject({scope:'historical_proof'});
   const generated=await act(page,'proof');const proofId=generated.body.proof.id as string;
   expect(generated.after.approvals.some(row=>row.proof_id===proofId&&row.status==='pending')).toBe(true);
   await act(page,'reserve');
   const blocked=await act(page,'commit',409);expect(blocked.body).toMatchObject({error:{code:'APPROVAL_REQUIRED'}});
   const approver=await browser.newContext({storageState:'output/playwright/task24/auth/approver.json'});
   try{
    const approvePage=await approver.newPage();await approvePage.goto(base+'/dealtwin/deals/judge-deal-a');await ready(approvePage);
    await expect(approvePage.getByTestId('server-role')).toHaveText('approver');
    const approval=blocked.after.approvals.find(row=>row.proof_id===proofId)!;
    const wait=approvePage.waitForResponse(response=>response.url().includes('/approvals/')&&response.request().method()==='POST');
    await approvePage.locator('[data-approval="'+approval.id+'"]').click();expect((await wait).status()).toBe(200);await ready(approvePage);
   }finally{await approver.close();}
   await page.getByRole('button',{name:'Refresh server state',exact:true}).click();await ready(page);
   const committed=await act(page,'commit');expect(committed.after.erp.salesOrders).toHaveLength(ordersBefore+1);
   lastCommit={url:committed.response.url(),body:committed.response.request().postDataJSON()};
   expect(committed.after.erp.cashMovements).toEqual(cashBefore);
   const linked=committed.after.deals.find(row=>row.id==='judge-deal-a')!.committedSalesOrderId;expect(linked).toBeTruthy();
   const retryButton=page.getByRole('button',{name:'Retry original successful request',exact:true});await expect(retryButton).toBeVisible();
   const retryWait=page.waitForResponse(response=>response.url().endsWith('/commit')&&response.request().method()==='POST');
   await retryButton.click();
   const retried=await retryWait;expect(retried.status()).toBe(200);expect(await retried.json()).toEqual(committed.body);await ready(page);
   expect((await state(page)).revision).toBe(committed.after.revision);
   await expect(page.locator('[data-action="commit"]')).toBeDisabled();
   await page.goto(base+'/dealtwin/deals/judge-deal-b');await ready(page);
   const collision=await act(page,'compile');expect(collision.body).toMatchObject({outcome:'DOES_NOT_COMPILE',reasonCode:'MINIMUM_CASH_VIOLATION',shortfallRupiah:'5000000',firstViolationDate:'2026-09-23'});
   expect(collision.body.conflictingCommitmentIds.length).toBeGreaterThan(0);
   const denied=await act(page,'reserve',409);expect(denied.body).toMatchObject({error:{code:'LIQUIDITY_COLLISION'},shortfallRupiah:'5000000'});
   expect(denied.after.commitments).toEqual(committed.after.commitments);expect(denied.after.erp.salesOrders).toHaveLength(ordersBefore+1);
   await page.getByRole('link',{name:'Commitment Ledger',exact:true}).click();await ready(page);
   await expect(page).toHaveURL(/\/dealtwin\/commitments\?dealId=judge-deal-b$/);await page.reload();await ready(page);
   await expect(page.getByText(collision.after.deals.find(row=>row.id==='judge-deal-b')!.title, {exact:true})).toBeVisible();
   await page.goto(base+'/dealtwin/deals/judge-deal-a');await ready(page);
   const changed=await act(page,'ap19');expect(changed.after.proofs.find(row=>row.id===proofId)?.status).toBe('STALE');
   await expect(page.getByTestId('proof-current-status')).toHaveText('Current: STALE');
   const remediation=await act(page,'recompile');expect(remediation.body).toMatchObject({outcome:'REMEDIATION_PENDING',minimumProjectedBalanceRupiah:'5200000'});
   expect(remediation.body.proof.terms.customerPaymentEvents[0].basisPoints).toBe(2700);
   expect(remediation.after.deals.find(row=>row.id==='judge-deal-a')!.committedSalesOrderId).toBe(linked);
   expect(remediation.after.erp.salesOrders).toHaveLength(ordersBefore+1);expect(remediation.after.erp.cashMovements).toEqual(cashBefore);expect(remediation.after.commitments).toEqual(committed.after.commitments);
   await expect(page.getByTestId('remediation-pending')).toBeVisible();
   await page.goto(base+'/dealtwin/proofs/'+encodeURIComponent(proofId));await ready(page);
   const replay=await act(page,'replay');expect(replay.body).toMatchObject({proofId,replayed:true,currentStatus:'STALE'});
   await expect(page.getByText('Replay · genuinely recomputed',{exact:true})).toBeVisible();
   const durable=await state(page);await page.reload();await ready(page);expect(await state(page)).toEqual(durable);
   await page.goto(base+'/dealtwin/judge');await ready(page);
   await expect(page.getByTestId('judge-status')).toHaveText('COMPLETE_REMEDIATION_PENDING');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   await page.screenshot({path:'output/playwright/task24/evidence/judge-'+width+'.png',fullPage:true});
   expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
test('unauthenticated mutations and injected identity are rejected without state change',async({browser})=>{
 const anonymous=await browser.newContext();const admin=await browser.newContext({storageState:'output/playwright/task24/auth/admin.json'});
 try{
  const page=await admin.newPage();const before=await state(page);
  expect((await anonymous.request.get(base+'/api/dealtwin/judge/state')).status()).toBe(401);
  expect((await anonymous.request.post(base+'/api/dealtwin/judge/reset',{headers:{origin:base},data:{expectedRevision:before.revision,idempotencyKey:'unauthorized'}})).status()).toBe(401);
  expect((await page.request.post(base+'/api/dealtwin/judge/reset',{headers:{origin:base},data:{expectedRevision:before.revision,idempotencyKey:'injected',tenantId:'foreign',role:'admin'}})).status()).toBe(422);
  expect(lastCommit).toBeDefined();
  const mismatch=await page.request.post(lastCommit!.url,{headers:{origin:base},data:{...lastCommit!.body,expectedRevision:before.revision}});
  expect(mismatch.status()).toBe(409);expect(await mismatch.json()).toMatchObject({error:{code:'IDEMPOTENCY_KEY_REUSED'}});
  expect(await state(page)).toEqual(before);
  await page.goto(base+'/dealtwin/judge');await ready(page);
  await page.evaluate(()=>{localStorage.setItem('dealtwin.judge-state',JSON.stringify({revision:999999,role:'admin',cash:{openingBalanceRupiah:'999999999'}}));sessionStorage.setItem('dealtwin-role','admin');});
  await page.reload();await ready(page);await expect(page.getByTestId('workspace-revision')).toHaveText('Revision '+before.revision);expect(await state(page)).toEqual(before);
  await page.goto(base+'/dealtwin/proofs/unknown-proof');await ready(page);
  await expect(page.getByText('Selected server Deal or Proof not found. No other Deal is substituted.',{exact:true})).toBeVisible();
  await expect(page.locator('[data-action="reserve"]')).toHaveCount(0);
 }finally{await anonymous.close();await admin.close();}
});

test('a lost mutation response retries the same request without a second state change',async({browser})=>{
 const context=await browser.newContext({storageState:'output/playwright/task24/auth/admin.json'});
 const page=await context.newPage();const bodies:unknown[]=[];let interrupted=false;
 try{
  await page.goto(base+'/dealtwin/erp');await ready(page);const before=await state(page);
  await context.route('**/api/dealtwin/judge/obligations/judge-existing-ap',async route=>{
   bodies.push(route.request().postDataJSON());
   if(!interrupted){
    interrupted=true;const accepted=await route.fetch();expect(accepted.status()).toBe(200);
    await route.abort('failed');
   }else await route.continue();
  });
  await page.locator('[data-action="ap19"]').click();await ready(page);
  await expect(page.getByRole('alert')).toContainText('The operation may already have completed');
  const after=await state(page);expect(after.revision).toBe(before.revision+1);
  await page.getByRole('button',{name:'Retry original request',exact:true}).click();await ready(page);
  expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0]);
  expect(await state(page)).toEqual(after);
  await expect(page.getByRole('alert')).toHaveCount(0);
 }finally{await context.close();}
});
