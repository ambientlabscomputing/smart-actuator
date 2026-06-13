// Design tokens for the public demo UI.
// Deliberately lightweight — no MUI, just CSS-in-JS via inline styles.

export const color = {
  bg: '#08060d',          // deep near-black background
  surface: '#111018',     // card/panel surface
  surfaceAlt: '#1a1727',  // raised rows, hover
  border: '#2a2640',      // default border

  accent: '#aa3bff',      // purple accent (from index.css)
  accentDim: 'rgba(170,59,255,0.15)',
  accentGlow: 'rgba(170,59,255,0.35)',

  textPrimary: '#f3f4f6',
  textSecondary: '#9ca3af',
  textDim: '#6b7280',

  ok: '#22c55e',
  danger: '#ef4444',
  warn: '#f59e0b',
  info: '#3b82f6',

  // Telemetry chart colors (match internal ui/)
  chartPosition:    '#4fc3f7', // cyan
  chartVelocity:    '#a78bfa', // violet
  chartCurrent:     '#fb923c', // orange
  chartTemperature: '#f87171', // rose
} as const

export const font = {
  sans: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
} as const

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const
