import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe,it,expect,vi } from 'vitest';
import { AppShell } from '../../../components/app-shell';
const route=vi.hoisted(()=>({pathname:'/dealtwin'}));
vi.mock('next/navigation',()=>({usePathname:()=>route.pathname}));
describe('DealTwin namespace does not use legacy browser role/data controls',()=>{
 it('renders server-only workspace children without requiring the legacy browser store or its role selector',()=>{
  route.pathname='/dealtwin/deals/server-deal';
  const html=renderToStaticMarkup(createElement(AppShell,null,createElement('main',null,'Server workspace boundary')));
  expect(html).toContain('Server workspace boundary');expect(html).not.toContain('Presentation Fallback');expect(html).not.toContain('Reset Demo Data');
 });
});
