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
])

