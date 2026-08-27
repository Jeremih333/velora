import { describe, expect, it } from 'vitest';
import {
  readResponseLengthLimit,
  readResponseLengthPromptInstruction,
  RESPONSE_LENGTH_PRESETS,
} from './response-lengths';

describe('response length presets', () => {
  it('keeps all four product presets in one server-owned runtime registry', () => {
    expect(
      Object.fromEntries(
        Object.entries(RESPONSE_LENGTH_PRESETS).map(([key, value]) => [key, value.maxOutputTokens]),
      ),
    ).toEqual({ SHORT: 400, MEDIUM: 800, DETAILED: 1_600, LONG: 8_192 });
    expect(readResponseLengthLimit('DETAILED')).toBe(1_600);
  });

  it('turns the selected length into a server-owned chat instruction', () => {
    for (const responseLength of ['SHORT', 'MEDIUM', 'DETAILED', 'LONG'] as const) {
      expect(readResponseLengthPromptInstruction(responseLength)).toMatch(/response length/iu);
    }
    expect(readResponseLengthPromptInstruction('SHORT')).not.toBe(
      readResponseLengthPromptInstruction('LONG'),
    );
  });
});
