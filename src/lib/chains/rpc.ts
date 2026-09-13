import type { Chain } from 'viem';

/**
 * The RPC a server route uses for a chain: a dedicated endpoint from the
 * environment (`RPC_URL_<chainId>`) when one is set, otherwise the chain's
 * own default. Public defaults have rate limits; anything on a path a user
 * waits on should get a keyed endpoint here.
 */
export function serverRpcUrl(chain: Chain): string {
  return process.env[`RPC_URL_${chain.id}`] || chain.rpcUrls.default.http[0];
}
