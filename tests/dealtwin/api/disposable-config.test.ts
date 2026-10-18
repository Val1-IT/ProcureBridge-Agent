import {it,expect,describe} from 'vitest';
import {assertDisposableJudgeDatabaseUrl} from '../../../lib/server/postgres/config';
describe('bounded local Judge database configuration',()=>{
 it('supports the verified fallback test port when Windows reserves the default',()=>{
  expect(()=>assertDisposableJudgeDatabaseUrl('postgres://app:test@127.0.0.1:55632/dealtwin_test')).not.toThrow();
 });
 it('continues to accept the existing disposable port',()=>{
  expect(()=>assertDisposableJudgeDatabaseUrl('postgres://app:test@127.0.0.1:55432/dealtwin_test')).not.toThrow();
 });
 it.each([
  'postgres://app:test@127.0.0.1:5432/dealtwin_test',
  'postgres://app:test@127.0.0.1:55633/dealtwin_test',
  'postgres://app:test@127.0.0.1:55632/production',
  'postgres://app:test@remote.example:55632/dealtwin_test',
  'postgres://app:test@localhost.example.com:55632/dealtwin_test',
 ])('refuses unrelated or production target %s',url=>{
  expect(()=>assertDisposableJudgeDatabaseUrl(url)).toThrow();
 });
});
