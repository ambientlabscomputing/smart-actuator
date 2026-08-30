import { useEffect, useState } from 'react'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined'
import { Alert, Box, Button, Chip, CircularProgress, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useFabricateGateway } from '@/hooks/useFabricateGateway'
import { getToken } from '@/lib/authClient'
import { accent, bg, borderColor, text } from '@/design'
import { AppToolbar } from '../AppToolbar'

interface FileItem { id: number; location: string }
async function localGet(path: string) { const token = getToken(); const response = await fetch(`/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw new Error(`Could not load ${path}`); return response.json() }

export function FabricateGatewayPage() {
  const gateway = useFabricateGateway()
  const [machines, setMachines] = useState<string[]>([]), [files, setFiles] = useState<FileItem[]>([])
  const [machine, setMachine] = useState(''), [attachmentText, setAttachmentText] = useState('')
  const [receipt, setReceipt] = useState<{ project_url: string } | null>(null)
  useEffect(() => { void Promise.all([localGet('/machines'), localGet('/files')]).then(([m, f]) => { setMachines(m); setMachine(m[0] ?? ''); setFiles(f.results ?? f.items ?? []) }).catch(() => undefined) }, [])
  const status = gateway.status
  return <Box sx={{ minHeight: '100svh', bgcolor: bg.canvas, color: text.primary }}><AppToolbar title="Fabricate" subtitle="Local-to-cloud gateway" /><Box component="main" sx={{ maxWidth: 1040, mx: 'auto', px: { xs: 2.5, md: 6 }, py: 5 }}><Stack spacing={4}>
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}><PrecisionManufacturingOutlinedIcon sx={{ color: accent.default }} /><Typography variant="h3">Fabrication bridge</Typography><Chip label={status?.paired ? 'Paired' : 'Local only'} color={status?.paired ? 'success' : 'default'} /></Stack>
    <Typography color="text.secondary">Only the snapshot reviewed here leaves this deployment. Fabricate cannot receive the Brain token or initiate motion.</Typography>
    {gateway.error && <Alert severity="error">{gateway.error}</Alert>}{!status && <CircularProgress />}
    {status && <Stack spacing={2} sx={{ borderTop: `1px solid ${borderColor.default}`, pt: 3 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}><Typography sx={{ flex: 1 }}>Cloud compatibility: <b>{status.compatibility?.status ?? (status.available ? 'unknown' : 'offline')}</b></Typography><Typography variant="caption">Deployment {status.deployment_id}</Typography></Stack>
      {!status.paired && !status.pairing && <Button variant="contained" disabled={!!gateway.busy} onClick={() => void gateway.beginPairing('Jog deployment')}>Pair this deployment</Button>}
      {status.pairing && <Alert severity="info" action={<Button onClick={() => window.open(`${status.pairing?.verification_uri}?user_code=${encodeURIComponent(status.pairing?.user_code ?? '')}`, '_blank', 'noopener,noreferrer')}>Open Fabricate</Button>}>Enter code <b>{status.pairing.user_code}</b>, then approve the deployment. <Button onClick={() => void gateway.pollPairing()}>Check approval</Button></Alert>}
      {status.device && <Stack direction="row" spacing={2}><Typography sx={{ flex: 1 }}>Organization {status.device.org_id}<br /><Typography component="span" variant="caption">Fingerprint {status.device.fingerprint}</Typography></Typography><Button onClick={() => void gateway.rotate()}>Rotate key</Button><Button color="warning" onClick={() => void gateway.reset()}>Reset local identity</Button></Stack>}
    </Stack>}
    {status?.paired && <Stack spacing={2} sx={{ borderTop: `1px solid ${borderColor.default}`, pt: 3 }}><Typography variant="h5">Prepare a machine snapshot</Typography>
      <TextField select label="Machine" value={machine} onChange={event => setMachine(event.target.value)}>{machines.map(id => <MenuItem key={id} value={id}>{id}</MenuItem>)}</TextField>
      <TextField label="Optional attachment IDs" helperText={files.length ? files.map(file => `${file.id}: ${file.location.split('/').pop()}`).join(' · ') : 'No stored files available'} value={attachmentText} onChange={event => setAttachmentText(event.target.value)} />
      <Button variant="outlined" disabled={!machine || !!gateway.busy} onClick={() => void gateway.prepare(machine, attachmentText.split(',').map(value => Number(value.trim())).filter(Number.isInteger))}>Prepare and review</Button>
      {gateway.prepared && <Stack spacing={1} sx={{ p: 2, border: `1px solid ${borderColor.default}` }}><Typography sx={{ fontFamily: 'monospace' }}>{gateway.prepared.digest}</Typography><Typography>{gateway.prepared.byte_size.toLocaleString()} bytes · {gateway.prepared.included_attachments.length} attachments</Typography><Typography variant="caption">Excluded: {gateway.prepared.excluded_categories.join(', ')}</Typography><Divider /><Button variant="contained" onClick={() => void gateway.send().then(value => value && setReceipt(value))}>Send snapshot to Fabricate</Button></Stack>}
      {receipt && <Alert severity="success" action={<Button endIcon={<OpenInNewRoundedIcon />} onClick={() => window.open(receipt.project_url, '_blank', 'noopener,noreferrer')}>Open project</Button>}>Snapshot accepted.</Alert>}
    </Stack>}
    {gateway.busy && <Alert icon={<CircularProgress size={18} />} severity="info">{gateway.busy}</Alert>}<Typography variant="caption" color="text.secondary">Release downloads can be verified but cannot be applied until M6.</Typography>
  </Stack></Box></Box>
}
