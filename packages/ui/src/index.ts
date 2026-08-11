export const themeNames = ['dark', 'amoled', 'light'] as const;
export type ThemeName = (typeof themeNames)[number];

export const motion = { fast: 120, normal: 220, slow: 360 } as const;
export const minimumViewportWidth = 320;
