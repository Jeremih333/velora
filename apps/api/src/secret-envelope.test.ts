import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './secret-envelope';

describe('secret envelope', () => {
  it('round-trips a child bot token and binds it to its record', async () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    const envelope = await encryptSecret('123456:secret-token', key, 'child-bot:one');
    expect(envelope.ciphertext).not.toContain('secret-token');
    await expect(decryptSecret(envelope, key, 'child-bot:one')).resolves.toBe(
      '123456:secret-token',
    );
    await expect(decryptSecret(envelope, key, 'child-bot:two')).rejects.toThrow(
      'Защищённые данные недоступны.',
    );
  });
});
