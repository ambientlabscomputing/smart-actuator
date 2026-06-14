export const motion = {
  duration: {
    fast: 200,
    base: 400,
    slow: 700,
    indeterminate: 1400,
  },
  ease: {
    out: [0.22, 1, 0.36, 1] as const,
    inOut: [0.65, 0, 0.35, 1] as const,
    indeterminate: [0.4, 0, 0.2, 1] as const,
  },
  trailSeconds: 2,
  pulseHz: 1,
} as const
