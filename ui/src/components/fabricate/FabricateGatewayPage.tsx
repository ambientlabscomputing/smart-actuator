import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined'
import { Box, Button, Chip, Divider, Stack, Typography } from '@mui/material'
import { useFabricateGateway } from '@/hooks/useFabricateGateway'
import { accent, bg, borderColor, text } from '@/design'
import { AppToolbar } from '../AppToolbar'

const futureStages = [
  ['Pair this deployment', 'M2'],
  ['Send a machine snapshot', 'M2'],
  ['Import a signed release', 'M6'],
  ['Commission and return evidence', 'M6'],
] as const

export function FabricateGatewayPage() {
  const gateway = useFabricateGateway()
  return (
    <Box sx={{ minHeight: '100svh', bgcolor: bg.canvas, color: text.primary }}>
      <AppToolbar title="Fabricate" subtitle="Local-to-cloud gateway" />
      <Box component="main" sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 2.5, md: 6 }, py: { xs: 5, md: 9 } }}>
        <Stack spacing={5}>
          <Stack spacing={2} sx={{ maxWidth: 760 }}>
            <Typography variant="overline" sx={{ color: accent.default, letterSpacing: '.14em' }}>Physical machine / cloud fabrication</Typography>
            <Typography variant="h2" sx={{ fontSize: { xs: 38, md: 64 }, lineHeight: .98, letterSpacing: '-.045em', fontWeight: 500 }}>The machine stays local. Its fabrication workspace can travel.</Typography>
            <Typography sx={{ color: text.dim, fontSize: 17, lineHeight: 1.7 }}>Fabricate receives only an explicit, reviewed machine snapshot. It never receives the local Brain token and cannot initiate motion.</Typography>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr .8fr' }, borderTop: `1px solid ${borderColor.default}` }}>
            <Stack spacing={2.5} sx={{ py: 4, pr: { md: 6 } }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}><PrecisionManufacturingOutlinedIcon sx={{ color: accent.default }} /><Typography variant="h5">Gateway not paired</Typography><Chip size="small" variant="outlined" label="M1 shell" /></Stack>
              <Typography sx={{ color: text.dim, lineHeight: 1.7 }}>Pairing and snapshot transfer arrive in M2. The gateway is present now so those capabilities become part of the machine’s interface instead of a remote-site afterthought.</Typography>
              <Button variant="contained" endIcon={<OpenInNewRoundedIcon />} onClick={() => window.open(gateway.cloudUrl, '_blank', 'noopener,noreferrer')} sx={{ alignSelf: 'flex-start' }}>Open Fabricate</Button>
            </Stack>
            <Stack divider={<Divider />} sx={{ borderLeft: { md: `1px solid ${borderColor.default}` }, pl: { md: 4 } }}>
              {futureStages.map(([label, milestone], index) => <Stack key={label} direction="row" spacing={2} sx={{ alignItems: 'center', py: 2.2, opacity: .62 }}><Typography sx={{ color: text.disabled, fontFamily: 'monospace', fontSize: 12 }}>{String(index + 1).padStart(2, '0')}</Typography><Typography sx={{ flex: 1 }}>{label}</Typography><Chip size="small" label={milestone} /></Stack>)}
            </Stack>
          </Box>
          <Typography variant="caption" sx={{ color: text.disabled }}>This page loads no Fabricate JavaScript. Open Fabricate launches the separate authenticated cloud origin.</Typography>
        </Stack>
      </Box>
    </Box>
  )
}
