/**
 * TelemetryPanel
 *
 * Four SVG sparklines (position, velocity, current, temperature) with
 * numeric readouts. No charting library — lightweight inline SVG.
 *
 * Pattern ported from ui/src/components/JointDataPanel.tsx.
 */

import React from 'react'
import type { ActuatorState } from '../lib/types'
import type { TelemetryHistory } from '../hooks/useActuatorSim'
import { color, font, radius, space } from '../design/tokens'

interface Props {
  state: ActuatorState | null
  history: TelemetryHistory
}

interface ChannelSpec {
  label: string
  unit: string
  key: keyof TelemetryHistory
  stateKey: keyof ActuatorState
  chartColor: string
  decimals: number
}

const CHANNELS: ChannelSpec[] = [
  { label: 'Position',    unit: 'rad', key: 'position',    stateKey: 'position',    chartColor: color.chartPosition,    decimals: 3 },
  { label: 'Velocity',    unit: 'r/s', key: 'velocity',    stateKey: 'velocity',    chartColor: color.chartVelocity,    decimals: 3 },
  { label: 'Current',     unit: 'A',   key: 'current',     stateKey: 'current',     chartColor: color.chartCurrent,     decimals: 2 },
  { label: 'Temperature', unit: '°C',  key: 'temperature', stateKey: 'temperature', chartColor: color.chartTemperature, decimals: 1 },
]

const CHART_W = 180
const CHART_H = 36

function wrapAngleRad(angle: number): number {
  const twoPi = Math.PI * 2
  let wrapped = ((angle + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
  // Keep +pi instead of -pi for display symmetry.
  if (wrapped === -Math.PI) wrapped = Math.PI
  return wrapped
}

function Sparkline({ data, chartColor }: { data: number[]; chartColor: string }) {
  if (data.length < 2) {
    return (
      <svg width={CHART_W} height={CHART_H} style={{ display: 'block' }}>
        <line x1={0} y1={CHART_H / 2} x2={CHART_W} y2={CHART_H / 2}
          stroke={chartColor} strokeWidth={1} opacity={0.2} />
      </svg>
    )
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * CHART_W
    const y = CHART_H - ((v - min) / range) * (CHART_H - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  return (
    <svg width={CHART_W} height={CHART_H} style={{ display: 'block', overflow: 'visible' }}>
      {/* Fill area under curve */}
      <polyline
        points={[
          `0,${CHART_H}`,
          ...points,
          `${CHART_W},${CHART_H}`,
        ].join(' ')}
        fill={chartColor}
        fillOpacity={0.08}
        stroke="none"
      />
      {/* Stroke line */}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={chartColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Latest value dot */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1]
        const x = CHART_W
        const y = CHART_H - ((last - min) / range) * (CHART_H - 4) - 2
        return <circle cx={x} cy={y} r={2.5} fill={chartColor} />
      })()}
    </svg>
  )
}

export function TelemetryPanel({ state, history }: Props) {
  const panelStyle: React.CSSProperties = {
    background: 'rgba(17,16,24,0.95)',
    border: `1px solid ${color.border}`,
    borderRadius: radius.lg,
    padding: `${space.md}px ${space.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: space.sm,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: space.md,
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: font.sans,
    fontSize: 10,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: color.textDim,
    width: 72,
    flexShrink: 0,
  }

  const valueStyle: React.CSSProperties = {
    fontFamily: font.mono,
    fontSize: 13,
    color: color.textPrimary,
    width: 68,
    textAlign: 'right',
    flexShrink: 0,
  }

  return (
    <div style={panelStyle}>
      {CHANNELS.map((ch) => {
        const rawUnwrapped = state ? (state[ch.stateKey] as number) : 0
        const raw = ch.key === 'position' ? wrapAngleRad(rawUnwrapped) : rawUnwrapped
        const formatted = raw.toFixed(ch.decimals)
        const data = ch.key === 'position'
          ? history.position.map(wrapAngleRad)
          : history[ch.key]

        return (
          <div key={ch.key} style={rowStyle}>
            <span style={labelStyle}>{ch.label}</span>
            <Sparkline data={data} chartColor={ch.chartColor} />
            <span style={{ ...valueStyle, color: ch.chartColor }}>
              {formatted}
              <span style={{ color: color.textDim, fontSize: 10, marginLeft: 3 }}>{ch.unit}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
