// SARIFF Mobile Theme — "Vault" design system
// Obsidian base · brass-gold for value · azure for actions · glass depth · fluid motion.
// NOTE: all existing token names are preserved so screens keep compiling. Values are upgraded.
// Screens that hardcode hex (e.g. '#0F172A', '#fff') must migrate to these tokens to get the
// full dark premium look — see the rollout plan. Until then, prefer tokens over literals.

export const colors = {
  // Primary brand (azure — interactive / actions)
  primary: '#5B9CFF',
  primaryDark: '#3B6FD4',
  primaryLight: '#7FB3FF',

  // Signature value accent (brass-gold — money / KES / balances)
  gold: '#E9B949',
  goldLight: '#F6D77E',
  goldDark: '#B98A2A',

  // Gradients (used with LinearGradient)
  gradients: {
    primary: ['#7FB3FF', '#3B6FD4'],      // azure action
    gold: ['#F6D77E', '#B98A2A'],         // value / premium CTA
    sidebar: ['#0A0C12', '#11141F', '#0A0C12'],
    emerald: ['#39D9B0', '#0F766E'],
    blue: ['#5B9CFF', '#3B6FD4'],
    green: ['#39D9B0', '#0F9E76'],
    purple: ['#9A7BFF', '#6D4AED'],
    orange: ['#F6B45E', '#D98A2A'],
    red: ['#FF6B81', '#D23B53'],
    dark: ['#0E111A', '#11141F'],
    card: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.03)'], // glass
    aurora: ['#5B9CFF', '#39D9B0', '#E9B949'],
  } as const,

  // Semantic
  success: '#39D9B0',
  successLight: 'rgba(57,217,176,0.14)',
  danger: '#FF6B81',
  dangerLight: 'rgba(255,107,129,0.14)',
  warning: '#F6B45E',
  warningLight: 'rgba(246,180,94,0.14)',
  info: '#5B9CFF',
  infoLight: 'rgba(91,156,255,0.14)',

  // Neutrals (dark/obsidian)
  white: '#FFFFFF',
  background: '#0A0C12',     // obsidian page bg
  surface: '#11141F',        // raised surface
  surfaceAlt: '#161A26',
  glass: 'rgba(255,255,255,0.045)',
  glassStrong: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.09)',
  borderLight: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.14)',

  // Text (on dark)
  text: '#F4F6FB',
  textSecondary: '#9AA6BE',
  textTertiary: '#646E86',
  textInverse: '#0A0C12',     // text on gold/light fills
  textMuted: '#4B5468',

  // Legacy dark-theme keys (kept for compatibility)
  dark: '#0A0C12',
  darkAlt: '#11141F',
  darkBorder: 'rgba(255,255,255,0.12)',
  darkText: '#F4F6FB',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 48,
};

export const borderRadius = {
  sm: 10, md: 16, lg: 22, xl: 28, xxl: 34, full: 999,
};

export const fontSize = {
  xs: 11, sm: 12.5, md: 14, lg: 16, xl: 18, xxl: 22, xxxl: 30, title: 38,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

// Custom fonts — loaded in App.tsx via @expo-google-fonts. Unloaded refs fall back to system.
export const fonts = {
  display: 'BricolageGrotesque_700Bold',   // balances, headings, big numbers
  ui: 'Sora_400Regular',                   // body
  uiMedium: 'Sora_500Medium',
  uiSemibold: 'Sora_600SemiBold',
};

// Motion design tokens — pair with Reanimated (already a dependency)
export const motion = {
  duration: { fast: 180, base: 280, slow: 460, page: 560 },
  // cubic-bezier control points for Easing.bezier(...)
  easing: {
    standard: [0.2, 0.7, 0.2, 1] as const,    // most transitions
    decel: [0.05, 0.7, 0.1, 1] as const,       // entrances
    spring: { damping: 16, stiffness: 180, mass: 0.9 }, // withSpring config
  },
  stagger: 60, // ms between list/section reveals
};

export const shadows = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 18, elevation: 6 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.45, shadowRadius: 32, elevation: 12 },
  xl: { shadowColor: '#000', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.5, shadowRadius: 50, elevation: 20 },
  // colored glow — use for gold CTAs and active states
  colored: (color: string) => ({
    shadowColor: color, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55, shadowRadius: 22, elevation: 12,
  }),
  gold: { shadowColor: '#E9B949', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 22, elevation: 12 },
};

// Reusable surface recipes (spread into style objects)
export const surfaces = {
  glassCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
  },
  raised: {
    backgroundColor: colors.surface,
    borderColor: colors.borderLight,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
};
