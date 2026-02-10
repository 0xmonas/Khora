import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function getAuthSession(): Promise<SessionData | null> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.address) {
    return null;
  }

  return {
    address: session.address,
    chainId: session.chainId,
  };
}
