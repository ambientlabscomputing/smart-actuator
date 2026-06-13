/**
 * MUI ThemeProvider configuration — Box 4 of RFD-14.
 *
 * Maps design tokens from `@/design` into a Material-UI palette so that all
 * MUI components (IconButton, Tooltip, Avatar, Drawer, Menu, …) inherit the
 * correct colours automatically without per-component `sx` overrides.
 *
 * This file lives inside `src/components/` because `@mui/material` imports are
 * restricted to that layer by the ESLint visual-boundary rule.
 */
import { createTheme } from '@mui/material/styles'
import { bg, text, borderColor, accent, semantic } from '@/design'

export const muiTheme = createTheme({
  palette: {
    mode: 'dark',

    // MUI maps palette.primary → filled buttons, focus rings, checked states.
    primary: {
      main: accent.default,
      dark: accent.hover,
      contrastText: accent.on,
    },

    // Error → danger (E-stop / fault)
    error: {
      main: semantic.danger,
    },

    // Warning → caution
    warning: {
      main: semantic.warn,
    },

    // Success → ok / connected
    success: {
      main: semantic.ok,
    },

    // Info → run mode / informational
    info: {
      main: semantic.info,
    },

    background: {
      default: bg.canvas,
      paper: bg.surface,
    },

    text: {
      primary: text.primary,
      secondary: text.secondary,
      disabled: text.disabled,
    },

    divider: borderColor.default,
  },

  // Square / minimal chrome to match the TE-inspired design language.
  shape: {
    borderRadius: 2,
  },

  components: {
    // Floating panels (Drawer, Popover, Menu) use surfaceRaised.
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: bg.surfaceRaised,
          border: `1px solid ${borderColor.default}`,
        },
      },
    },

    // Dividers use the dim border token.
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: borderColor.dim,
        },
      },
    },

    // ListItemButton hover uses surfaceAlt.
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          '&:hover': {
            backgroundColor: bg.surfaceAlt,
          },
        },
      },
    },

    // Tooltips: surface background with hairline border.
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: bg.surfaceRaised,
          color: text.secondary,
          border: `1px solid ${borderColor.default}`,
          fontSize: 11,
          borderRadius: 2,
        },
        arrow: {
          color: bg.surfaceRaised,
        },
      },
    },

    // IconButton: inherit text.dim; accent on active/selected.
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: text.dim,
          borderRadius: 2,
          '&:hover': {
            backgroundColor: bg.surfaceAlt,
          },
        },
      },
    },
  },
})
