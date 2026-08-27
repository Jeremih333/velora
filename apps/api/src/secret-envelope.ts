import { AppError } from '@velora/shared';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SecretEnvelope {
  readonly ciphertext: string;
  readonly iv: string;
}

export async function encryptSecret(
  plaintext: string,
  keyBase64: string,
  associatedData: string,
): Promise<SecretEnvelope> {
  const key = await importEnvelopeKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(associatedData), tagLength: 128 },
    key,
    encoder.encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

export async function decryptSecret(
  envelope: SecretEnvelope,
  keyBase64: string,
  associatedData: string,
): Promise<string> {
  try {
    const key = await importEnvelopeKey(keyBase64);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(envelope.iv),
        additionalData: encoder.encode(associatedData),
        tagLength: 128,
      },
      key,
      fromBase64(envelope.ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new AppError('SECRET_DECRYPTION_FAILED', 'Защищённые данные недоступны.', 503);
  }
}

async function importEnvelopeKey(value: string): Promise<CryptoKey> {
  const raw = fromBase64(value);
  if (raw.byteLength !== 32) {
    throw new AppError('SECRET_KEY_INVALID', 'Ключ шифрования дочерних ботов не настроен.', 503);
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new AppError('SECRET_KEY_INVALID', 'Ключ шифрования дочерних ботов не настроен.', 503);
  }
}
