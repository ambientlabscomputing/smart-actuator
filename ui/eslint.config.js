import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Packages that are implementation details of the components layer.
// Only files under src/components/ may import these directly.
// Everywhere else, import from '@/components' instead.
const VISUAL_LAYER_PACKAGES = [
  '@mui/material',
  '@mui/material/*',
  '@mui/icons-material',
  '@mui/icons-material/*',
  '@emotion/react',
  '@emotion/styled',
  '@react-three/fiber',
  '@react-three/drei',
  'three',
  'three/*',
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Enforce the visual-language boundary: only src/components/** may import
  // MUI, Emotion, three, or R3F directly.  Everything else must import from
  // @/components.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: VISUAL_LAYER_PACKAGES.map((pkg) => ({
            name: pkg,
            message: `Import from '@/components' instead of '${pkg}' directly. MUI, Emotion, three, and R3F are implementation details of the components layer.`,
          })),
          patterns: VISUAL_LAYER_PACKAGES.map((pkg) => ({
            group: [pkg],
            message: `Import from '@/components' instead. MUI, Emotion, three, and R3F are implementation details of the components layer.`,
          })),
        },
      ],
    },
  },
  // Enforce the auth-boundary: only src/lib/authClient.ts may access
  // localStorage directly. All other code must call authClient helpers.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/authClient.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          property: 'getItem',
          message: 'Use authClient.getToken() instead of localStorage directly.',
        },
        {
          object: 'localStorage',
          property: 'setItem',
          message: 'Use authClient.setToken() instead of localStorage directly.',
        },
        {
          object: 'localStorage',
          property: 'removeItem',
          message: 'Use authClient.setToken(null) instead of localStorage directly.',
        },
      ],
    },
  },
  // Box 4 (RFD-14): forbid bare hex/rgb/hsl color literals in component code.
  // All colours must come from src/design/theme.ts or src/design/tokens.ts.
  //
  // Exceptions:
  //   src/design/**      — the token source files themselves
  //   src/components/canvas/**   — Box 1 environment shader colours (THREE.Color uniforms)
  //   src/components/mesh/**     — Box 2 procedural mesh colours (THREE.Color instances)
  //   src/components/AppCanvas.tsx — Box 1 lighting rig colours
  //   src/components/mesh/MotionEnvelope.tsx — Box 2 arc/tick colours
  //   src/components/mesh/MaterialRegistry.ts — Box 2 material presets
  //   src/pages/MeshLab.tsx — dev-only preview page
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/design/**',
      'src/components/canvas/**',
      'src/components/mesh/**',
      'src/components/AppCanvas.tsx',
      'src/pages/MeshLab.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Standalone quoted hex literal: '#rrggbb' or '#rgb'
          selector: "Literal[value=/^#[0-9a-fA-F]{3,6}$/]",
          message:
            "Hex colour literals are forbidden outside src/design/. " +
            "Import from '@/design' instead (bg, text, accent, semantic, chart, machineColors…).",
        },
      ],
    },
  },
])
