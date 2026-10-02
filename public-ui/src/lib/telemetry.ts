import type { TelemetryConfig } from 'ambient-telemetry/web'

export interface TelemetryEnv {
  PROD?: boolean
  VITE_UMAMI_HOST?: string
  VITE_UMAMI_WEBSITE_ID?: string
  VITE_GLITCHTIP_DSN?: string
  VITE_RELEASE?: string
}

/** Null unless this is a production build with at least one backend configured, so dev
 * and unconfigured builds never send anything. Each backend is optional on its own. */
export function telemetryConfig(env: TelemetryEnv): TelemetryConfig | null {
  if (!env.PROD) return null
  const umami = env.VITE_UMAMI_HOST && env.VITE_UMAMI_WEBSITE_ID
    ? { host: env.VITE_UMAMI_HOST, websiteId: env.VITE_UMAMI_WEBSITE_ID }
    : undefined
  const glitchtip = env.VITE_GLITCHTIP_DSN ? { dsn: env.VITE_GLITCHTIP_DSN } : undefined
  if (!umami && !glitchtip) return null
  return {
    app: 'jog-public-ui',
    environment: 'production',
    release: env.VITE_RELEASE || undefined,
    umami,
    glitchtip,
  }
}

type Telemetry = typeof import('ambient-telemetry/web')
type Call = (t: Telemetry) => void

let telemetry: Telemetry | undefined
const pending: Call[] = []
let enabled = false

function run(call: Call): void {
  if (!enabled) return
  if (telemetry) call(telemetry)
  else pending.push(call)
}

/** Loads the telemetry bundle after the page is idle (it carries the Sentry SDK, which
 * must not compete with LCP) and queues events fired in the meantime. Never throws. */
export function initTelemetry(env: TelemetryEnv = import.meta.env): void {
  const config = telemetryConfig(env)
  if (!config) return
  enabled = true
  const start = () => {
    import('ambient-telemetry/web')
      .then((t) => {
        t.init(config)
        telemetry = t
        pending.splice(0).forEach((call) => call(t))
      })
      .catch(() => {
        // blocked or offline: telemetry must never affect the page
      })
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start)
  else setTimeout(start, 1)
}

export const recordPage = (path: string): void => run((t) => t.page(path))
export const track = (name: string, data?: Record<string, string | number | boolean>): void =>
  run((t) => t.track(name, data))
export const captureError = (
  err: unknown,
  opts?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void => run((t) => t.captureError(err, opts))
