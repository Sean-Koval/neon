/**
 * Neon Theme Tokens
 *
 * Single source of truth for colors and design tokens.
 * These values mirror what's defined in tailwind.config.ts.
 */

export const colors = {
  primary: {
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2',
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
  },
  accent: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#9333ea',
    700: '#7c3aed',
    800: '#6b21a8',
    900: '#581c87',
  },
  dark: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
} as const

export const darkTheme = {
  surface: {
    base: colors.dark[950],
    raised: colors.dark[900],
    card: colors.dark[800],
    overlay: colors.dark[700],
  },
  border: {
    default: colors.dark[700],
    subtle: colors.dark[800],
  },
  text: {
    primary: colors.dark[50],
    secondary: colors.dark[400],
    muted: colors.dark[500],
  },
} as const

export const lightTheme = {
  surface: {
    base: '#ffffff',
    raised: colors.dark[50],
    card: '#ffffff',
    overlay: '#ffffff',
  },
  border: {
    default: colors.dark[200],
    subtle: colors.dark[100],
  },
  text: {
    primary: colors.dark[900],
    secondary: colors.dark[600],
    muted: colors.dark[400],
  },
} as const

export const gradients = {
  neon: 'linear-gradient(135deg, #06b6d4 0%, #8b5cf6 50%, #d946ef 100%)',
  glow: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 100%)',
} as const
