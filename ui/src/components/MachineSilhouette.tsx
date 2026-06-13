import type { DHJointValues } from '../lib/types'
import { accent, bg, borderColor, text } from '@/design'

interface MachineSilhouetteProps {
  joints: DHJointValues[]
  jointOrigins: [number, number, number][]
  ee: [number, number, number] | null
  width?: number
  height?: number
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function MachineSilhouette({
  joints,
  jointOrigins,
  ee,
  width = 260,
  height = 88,
}: MachineSilhouetteProps) {
  const worldPts: Array<[number, number]> = [[0, 0], ...jointOrigins.map(([x, , z]) => [x, z] as [number, number])]
  if (ee) worldPts.push([ee[0], ee[2]])

  const xs = worldPts.map(([x]) => x)
  const ys = worldPts.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1e-6)
  const spanY = Math.max(maxY - minY, 1e-6)
  const pad = 10
  const sx = (width - pad * 2) / spanX
  const sy = (height - pad * 2) / spanY
  const scale = Math.max(Math.min(sx, sy), 1e-6)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2

  function toCanvas([x, y]: [number, number]): [number, number] {
    const dx = (x - cx) * scale
    const dy = (y - cy) * scale
    return [width / 2 + dx, height / 2 - dy]
  }

  const polyline = worldPts
    .map((pt) => {
      const [x, y] = toCanvas(pt)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Machine silhouette"
      style={{ display: 'block', background: bg.surface, border: `1px solid ${borderColor.dim}`, borderRadius: 4 }}
    >
      <line x1={0} y1={height - 8} x2={width} y2={height - 8} stroke={borderColor.dim} strokeWidth={1} />
      <polyline fill="none" stroke={text.dim} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" points={polyline} />

      {[...[ [0, 0] as [number, number] ], ...jointOrigins.map(([x, , z]) => [x, z] as [number, number])].map((pt, i) => {
        const [cxp, cyp] = toCanvas(pt)
        const jt = i === 0 ? 'base' : (joints[i - 1]?.type ?? 'revolute')
        const alpha = clamp01(0.95 - i * 0.04)
        if (jt === 'prismatic') {
          return (
            <rect
              key={`j-${i}`}
              x={cxp - 3.6}
              y={cyp - 3.6}
              width={7.2}
              height={7.2}
              fill={accent.default}
              fillOpacity={alpha}
              stroke={bg.canvas}
              strokeWidth={1}
            />
          )
        }
        return (
          <circle
            key={`j-${i}`}
            cx={cxp}
            cy={cyp}
            r={3.6}
            fill={accent.default}
            fillOpacity={alpha}
            stroke={bg.canvas}
            strokeWidth={1}
          />
        )
      })}
    </svg>
  )
}
