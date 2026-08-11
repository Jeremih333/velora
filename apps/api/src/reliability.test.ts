import { describe, expect, it } from 'vitest';
import {
  alignedWindow,
  effectiveLimit,
  policyForRequest,
  productEventForRequest,
} from './reliability';

describe('reliability policy', () => {
  it('assigns independent critical-route limits without matching ordinary reads', () => {
    expect(policyForRequest('GET', '/api/v1/discovery')?.scope).toBe('SEARCH');
    expect(policyForRequest('POST', '/api/v1/conversations/c1/generate')?.scope).toBe('GENERATION');
    expect(policyForRequest('POST', '/api/v1/conversations/c1/memory/regenerate')?.scope).toBe(
      'MEMORY_REBUILD',
    );
    expect(policyForRequest('POST', '/api/v1/billing/access-invoices')?.scope).toBe(
      'SESSION_MUTATION',
    );
    expect(policyForRequest('PATCH', '/api/v1/admin/billing/plans/PLUS')?.scope).toBe(
      'SESSION_MUTATION',
    );
    expect(policyForRequest('GET', '/api/v1/conversations')).toBeNull();
  });

  it('aligns windows and applies role/abuse policy deterministically', () => {
    expect(alignedWindow(61_234, 60_000)).toBe(60_000);
    expect(effectiveLimit(10, 'USER', 'ACTIVE')).toBe(10);
    expect(effectiveLimit(10, 'OWNER', 'ACTIVE')).toBe(20);
    expect(effectiveLimit(10, 'USER', 'RESTRICTED')).toBe(5);
  });

  it('records only allowlisted successful product events without content', () => {
    expect(productEventForRequest('POST', '/api/v1/characters', 201)).toEqual({
      name: 'CHARACTER_CREATED',
      routeGroup: 'characters',
    });
    expect(productEventForRequest('POST', '/api/v1/conversations/c1/messages', 201)).toEqual({
      name: 'MESSAGE_SENT',
      routeGroup: 'conversations',
    });
    expect(productEventForRequest('POST', '/api/v1/conversations/c1/messages', 500)).toBeNull();
  });
});
