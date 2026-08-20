/**
 * BuilderShowcaseVideo
 *
 * Screen-capture walkthrough of the actual machine builder (configure, jog,
 * teach, run). Sits above the WASM demo to contrast "here's the real app"
 * with "here's the real control stack running in your browser" below it.
 */

import { color, font, space, radius } from '../design/tokens'
import videoPoster from '../assets/screenshots/video-poster.jpg'

const VIDEO_SRC = 'https://cdn.ambientlabs.io/smart-actuator/jog-actuator-demo.mp4'

export function BuilderShowcaseVideo() {
  return (
    <section style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: space.lg,
      padding: `0 ${space.lg}px ${space.xxl}px`,
      width: '100%',
      maxWidth: 1100,
      margin: '0 auto',
      boxSizing: 'border-box',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{
          fontFamily: font.sans,
          fontSize: 'clamp(22px, 3vw, 32px)',
          fontWeight: 700,
          color: color.textPrimary,
          margin: 0,
          marginBottom: space.sm,
        }}>
          Configure, jog, teach, run.
        </h2>
        <p style={{
          fontFamily: font.sans,
          fontSize: 15,
          color: color.textSecondary,
          margin: 0,
          maxWidth: 680,
        }}>
          A real screen capture of the machine builder — pick a kinematic
          template, jog it in Cartesian or joint space, teach it a sequence
          by hand, then save and run that program.
        </p>
      </div>

      <div style={{
        width: '100%',
        borderRadius: radius.lg,
        overflow: 'hidden',
        border: `1px solid ${color.border}`,
        background: color.surface,
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }}>
        <video
          src={VIDEO_SRC}
          poster={videoPoster}
          controls
          muted
          playsInline
          preload="metadata"
          style={{ display: 'block', width: '100%', height: 'auto', background: '#000' }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </section>
  )
}
