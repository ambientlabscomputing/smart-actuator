export interface FabricateGatewayState {
  cloudUrl: string
  pairing: 'unpaired'
  entitlement: 'unknown'
  snapshotTransfer: 'unavailable'
  releaseImport: 'unavailable'
  commissioning: 'unavailable'
}

export function useFabricateGateway(): FabricateGatewayState {
  return {
    cloudUrl: import.meta.env.VITE_FABRICATE_URL ?? 'https://fabricate.ambientlabs.com',
    pairing: 'unpaired',
    entitlement: 'unknown',
    snapshotTransfer: 'unavailable',
    releaseImport: 'unavailable',
    commissioning: 'unavailable',
  }
}
