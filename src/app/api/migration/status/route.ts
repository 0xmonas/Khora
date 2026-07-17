import { NextResponse } from 'next/server';
import { migrationConfig, readClaimsOpen } from '@/lib/server/migration';

export const maxDuration = 10;

export async function GET() {
  const cfg = migrationConfig();
  // Live only when BOTH the env config exists AND the contract is unpaused.
  // Keeps the UI in "not live" state between deploy day and launch day, so
  // nobody burns on Shape before claims can actually succeed.
  const claimsOpen = cfg.enabled ? await readClaimsOpen() : null;
  const enabled = cfg.enabled && claimsOpen === true;
  return NextResponse.json(
    {
      enabled,
      reason: !cfg.enabled ? (cfg.reason ?? null) : claimsOpen !== true ? 'claims_paused' : null,
      booaEth: cfg.booaEth,
      burnHelper: cfg.burnHelper,
      shapeBooa: cfg.shapeBooa,
      operator: cfg.operator,
      ethChainId: cfg.ethChainId,
      shapeChainId: 360,
      confirmations: cfg.confirmations,
      maxSupply: 3333,
    },
    { headers: { 'Cache-Control': 'public, max-age=30' } },
  );
}
