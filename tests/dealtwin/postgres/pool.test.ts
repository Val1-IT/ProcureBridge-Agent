import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createIndependentPostgresPool } from '../../../lib/server/postgres/pool';

describe('independent pg pool authentication (no database connections)', () => {
  it('retains a hidden password, connection identity and limits without sharing a pool', async () => {
    const original = new Pool({ host: '127.0.0.1', port: 55432, database: 'dealtwin_test', user: 'synthetic-app', password: 'synthetic-unit-only', ssl: false, max: 10, statement_timeout: 5000 });
    const independent = createIndependentPostgresPool(original, { max: 1, application_name: 'synthetic-race' });
    try {
      expect(Object.keys(original.options)).not.toContain('password');
      expect(independent).not.toBe(original);
      expect(independent.options.password).toBe(original.options.password);
      expect(independent.options).toMatchObject({ host: '127.0.0.1', port: 55432, database: 'dealtwin_test', user: 'synthetic-app', ssl: false, max: 1, statement_timeout: 5000, application_name: 'synthetic-race' });
      expect(original.options.max).toBe(10);
      expect(Object.keys(independent.options)).not.toContain('password');
      expect(JSON.stringify(independent.options)).not.toContain('synthetic-unit-only');
    } finally { await independent.end(); await original.end(); }
  });
  it('preserves a deferred password provider without evaluating it during construction', async () => {
    let calls = 0;
    const password = async () => { calls++; return 'synthetic-unit-only'; };
    const original = new Pool({ password, ssl: { rejectUnauthorized: true } });
    const independent = createIndependentPostgresPool(original);
    try {
      expect(independent.options.password).toBe(password);
      expect(independent.options.ssl).toEqual({ rejectUnauthorized: true });
      expect(calls).toBe(0);
    } finally { await independent.end(); await original.end(); }
  });
});
