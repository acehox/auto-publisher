import { LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { loginWithDiscord, logout } from './nav-auth-actions';
import { displayNameOf, loginButtonClass, type NavUser, UserAvatar } from './nav-user';

/** A plain form, so the CTA works before hydration. */
export function LoginButton({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <form action={loginWithDiscord} className={fullWidth ? 'w-full' : undefined}>
      <Button type="submit" className={cn(fullWidth && 'w-full', loginButtonClass)}>
        Login with Discord
      </Button>
    </form>
  );
}

/** No onNavigate handler: the bar closes the panel on the route change itself. */
export function MobileAccount({ user }: { user: NavUser }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 px-1 py-2">
        <UserAvatar user={user} size={36} />
        <span className="truncate text-sm text-white">{displayNameOf(user)}</span>
      </div>
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboard
      </Link>
      {/* TODO: re-enable when Subscriptions is ready (re-add the CreditCard import).
      <span className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-600">
        <CreditCard className="h-4 w-4" />
        Subscriptions
      </span>
      */}
      <form action={logout}>
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </form>
    </div>
  );
}
