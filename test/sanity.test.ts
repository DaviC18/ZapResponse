import { describe, expect, it } from 'vitest';

describe('test runner', () => {
  it('roda TypeScript com os paths do workspace', async () => {
    const { CONTRACTS_VERSION } = await import('@zapresponse/contracts');
    expect(CONTRACTS_VERSION).toBe('0.0.0');
  });
});
