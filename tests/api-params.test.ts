import { describe, expect, it } from 'vitest';
import { num } from '@/app/api/_lib/respond';

describe('num', () => {
  it('uses the fallback when the parameter is absent', () => {
    // Number(null) === 0, so this is the case that silently returned
    // "limit: 0" and made every defaulted endpoint return nothing.
    expect(num(null, 20)).toBe(20);
    expect(num(undefined, 20)).toBe(20);
    expect(num('', 20)).toBe(20);
    expect(num('   ', 20)).toBe(20);
  });

  it('uses the fallback for non-numeric input', () => {
    expect(num('abc', 20)).toBe(20);
  });

  it('reads a real value, including an explicit zero', () => {
    expect(num('50', 20)).toBe(50);
    expect(num('0', 20)).toBe(0);
    expect(num('-5', 20)).toBe(-5);
  });
});
