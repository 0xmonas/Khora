import { redirect } from 'next/navigation';

export default function WaitlistRedirect() {
  redirect('/allowlist');
}
