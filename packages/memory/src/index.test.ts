import { describe, expect, it } from 'vitest';
import { buildDeterministicSummary, isMemoryStale, validateMemoryVersion } from './index';

describe('memory invariants', () => {
  it('requires coverage for auto summaries', () => {
    expect(() => {
      validateMemoryVersion({
        content: 'fact',
        source: 'AUTO_SUMMARY',
        previousVersionId: null,
        fromMessageId: null,
        toMessageId: null,
      });
    }).toThrow();
  });

  it('marks a memory stale when covered history was edited', () => {
    expect(isMemoryStale(100, 99)).toBe(true);
    expect(isMemoryStale(100, 101)).toBe(false);
  });
});

describe('deterministic memory fallback', () => {
  it('handles an empty conversation without inventing facts', () => {
    const summary = buildDeterministicSummary({ messages: [], mode: 'FULL' });
    expect(summary.messageCount).toBe(0);
    expect(summary.toMessageId).toBeNull();
    expect(summary.content).toContain('Хронология пока пуста');
  });

  it('preserves manual memory and real message order', () => {
    const summary = buildDeterministicSummary({
      mode: 'INCREMENTAL',
      preservedMemory: 'Не забывать обещание у маяка.',
      messages: [
        { id: 'first', role: 'USER', content: 'Мы встретимся у маяка.' },
        { id: 'last', role: 'ASSISTANT', content: 'Я принесу старую карту.' },
      ],
    });
    expect(summary.content).toContain('Не забывать обещание у маяка.');
    expect(summary.content.indexOf('Мы встретимся')).toBeLessThan(
      summary.content.indexOf('Я принесу'),
    );
    expect(summary.fromMessageId).toBe('first');
    expect(summary.toMessageId).toBe('last');
  });

  it('covers early and late history in a 500-message branch within the hard limit', () => {
    const messages = Array.from({ length: 500 }, (_, index) => ({
      id: `message-${String(index)}`,
      role: index % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
      content: `Событие ${String(index)}: ${'подробность '.repeat(40)}`,
    }));
    const summary = buildDeterministicSummary({ messages, mode: 'FULL' });
    expect(summary.messageCount).toBe(500);
    expect(summary.content).toContain('Событие 0:');
    expect(summary.content).toContain('Событие 499:');
    expect(summary.content.length).toBeLessThanOrEqual(56_000);
  });

  it('hierarchically covers the beginning, middle and end beyond 500 messages', () => {
    const messages = Array.from({ length: 1_200 }, (_, index) => ({
      id: `long-${String(index)}`,
      role: index % 2 === 0 ? ('USER' as const) : ('ASSISTANT' as const),
      content: `Уникальное событие ${String(index)}: ${'деталь '.repeat(100)}`,
    }));
    const summary = buildDeterministicSummary({ messages, mode: 'FULL' });
    expect(summary.model).toBe('deterministic-hierarchical-v1');
    expect(summary.messageCount).toBe(1_200);
    expect(summary.fromMessageId).toBe('long-0');
    expect(summary.toMessageId).toBe('long-1199');
    expect(summary.content).toContain('Уникальное событие 0:');
    expect(summary.content).toContain('Уникальное событие 600:');
    expect(summary.content).toContain('Уникальное событие 1199:');
    expect(summary.content.length).toBeLessThanOrEqual(56_000);
  });

  it('fails safely instead of silently truncating oversized manual memory', () => {
    expect(() =>
      buildDeterministicSummary({
        messages: [{ id: 'one', role: 'USER', content: 'Новое событие' }],
        preservedMemory: 'x'.repeat(55_000),
        mode: 'INCREMENTAL',
      }),
    ).toThrow('manual memory');
  });
});
