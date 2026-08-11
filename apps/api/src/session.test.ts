import { describe, expect, it } from 'vitest';
import { sha256 } from './telegram-auth';
import { readCookie, verifyCsrfToken } from './session';

describe('session security', () => {
  it('reads an exact cookie without accepting similarly named values', () => {
    expect(readCookie('other=x; velora_session=hello%20world; suffix=y', 'velora_session')).toBe(
      'hello world',
    );
    expect(readCookie('velora_session_extra=forged', 'velora_session')).toBeNull();
    expect(readCookie('velora_session=%E0%A4%A', 'velora_session')).toBeNull();
  });

  it('accepts only the CSRF token bound to the server session key', async () => {
    const expected = await sha256('key:csrf-token');
    await expect(verifyCsrfToken('csrf-token', expected, 'key')).resolves.toBeUndefined();
    await expect(verifyCsrfToken('forged', expected, 'key')).rejects.toMatchObject({
      code: 'INVALID_CSRF',
    });
    await expect(verifyCsrfToken(undefined, expected, 'key')).rejects.toMatchObject({
      code: 'INVALID_CSRF',
    });
  });
});
