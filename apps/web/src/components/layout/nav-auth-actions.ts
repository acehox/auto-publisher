'use server';

import { signIn, signOut } from '@/lib/auth';

// Server actions rather than next-auth's client signIn/signOut: the logged-out
// bar is then a plain <form> that needs no JS at all.
export async function loginWithDiscord(): Promise<void> {
  await signIn('discord', { redirectTo: '/dashboard' });
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
