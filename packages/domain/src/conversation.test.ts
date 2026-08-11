import { describe, expect, it } from 'vitest';
import {
  conversationCreateSchema,
  conversationPatchSchema,
  memoryEditSchema,
  generationCreateSchema,
  messageCreateSchema,
} from './index';

describe('conversation schemas', () => {
  it('requires stable idempotency keys on writes', () => {
    expect(
      conversationCreateSchema.safeParse({
        characterId: crypto.randomUUID(),
        idempotencyKey: 'message:create:01',
      }).success,
    ).toBe(true);
    expect(
      messageCreateSchema.safeParse({ content: 'hello', idempotencyKey: 'bad key' }).success,
    ).toBe(false);
    expect(
      conversationCreateSchema.parse({
        characterId: crypto.randomUUID(),
        idempotencyKey: 'preview:create:01',
        preview: true,
      }).preview,
    ).toBe(true);
  });

  it('rejects empty patches and oversized memory', () => {
    expect(conversationPatchSchema.safeParse({}).success).toBe(false);
    expect(
      memoryEditSchema.safeParse({ content: 'x'.repeat(64_001), idempotencyKey: 'memory:01' })
        .success,
    ).toBe(false);
  });

  it('allows explicit continuation but rejects unknown generation actions', () => {
    expect(
      generationCreateSchema.parse({
        parentMessageId: crypto.randomUUID(),
        mode: 'CONTINUE',
        idempotencyKey: 'continue:message:01',
      }).mode,
    ).toBe('CONTINUE');
    expect(
      generationCreateSchema.safeParse({
        mode: 'DELETE',
        idempotencyKey: 'continue:message:02',
      }).success,
    ).toBe(false);
  });
});
