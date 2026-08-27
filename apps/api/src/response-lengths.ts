import type { ResponseLength } from '@velora/domain';

interface ResponseLengthPreset {
  readonly maxOutputTokens: number;
  readonly promptInstruction: string;
}

/** Authoritative runtime ceilings. The browser submits only a preset ID. */
export const RESPONSE_LENGTH_PRESETS = {
  SHORT: {
    maxOutputTokens: 400,
    promptInstruction: 'Preferred response length: short and compact, roughly 1–2 paragraphs.',
  },
  MEDIUM: {
    maxOutputTokens: 800,
    promptInstruction:
      'Preferred response length: medium, with enough detail to advance the scene.',
  },
  DETAILED: {
    maxOutputTokens: 1_600,
    promptInstruction:
      'Preferred response length: detailed, with developed action, atmosphere, and dialogue.',
  },
  LONG: {
    maxOutputTokens: 8_192,
    promptInstruction:
      'Preferred response length: long-form, while staying relevant and avoiding repetition.',
  },
} as const satisfies Readonly<Record<ResponseLength, ResponseLengthPreset>>;

export function readResponseLengthLimit(responseLength: ResponseLength): number {
  return RESPONSE_LENGTH_PRESETS[responseLength].maxOutputTokens;
}

export function readResponseLengthPromptInstruction(responseLength: ResponseLength): string {
  return RESPONSE_LENGTH_PRESETS[responseLength].promptInstruction;
}
