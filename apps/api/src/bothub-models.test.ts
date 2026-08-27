import { describe, expect, it } from 'vitest';
import { parseBotHubModelCapabilitiesRow } from './bothub-models';

describe('BotHub model capability cache', () => {
  it('keeps reviewed models when an older cache still contains retired provider IDs', () => {
    expect(
      parseBotHubModelCapabilitiesRow({
        availableCandidatesJson: JSON.stringify([
          'deepseek-chat-v3.1',
          'mistral-nemo',
          'l3-lunaris-8b',
          'llama-3.3-70b-instruct',
          'gpt-5.4-mini',
          'gpt-5-nano',
        ]),
        selectedModel: 'gpt-5.4-mini',
        checkedAt: 123,
      }),
    ).toEqual({
      availableCandidates: [
        'deepseek-chat-v3.1',
        'mistral-nemo',
        'l3-lunaris-8b',
        'llama-3.3-70b-instruct',
      ],
      selectedModel: null,
      checkedAt: 123,
    });
  });

  it('fails closed for malformed capability payloads', () => {
    expect(
      parseBotHubModelCapabilitiesRow({
        availableCandidatesJson: '{broken',
        selectedModel: null,
        checkedAt: 123,
      }),
    ).toBeNull();
  });
});
