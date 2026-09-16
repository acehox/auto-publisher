import { redirect } from 'next/navigation';
import { AuthRedirect } from '@/components/auth/auth-redirect';
import { Navbar } from '@/components/layout/navbar';
import { SiteShell } from '@/components/layout/site-shell';
import { auth } from '@/lib/auth';

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <SiteShell nav={<Navbar />}>
      <AuthRedirect callbackUrl="/dashboard" />
    </SiteShell>
  );
}
