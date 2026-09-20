'use client';

// CreditCard: re-add when the Subscriptions menu item is restored (see below).
import { ChevronDown, LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from './nav-auth-actions';
import { displayNameOf, type NavUser, UserAvatar } from './nav-user';

/** The one client island in the signed-in bar — a popover needs JS. */
export function AccountMenu({ user }: { user: NavUser }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={displayNameOf(user)}
        className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-slate-800/50"
      >
        <UserAvatar user={user} size={32} />
        <span className="hidden max-w-40 truncate text-sm text-white sm:block">
          {displayNameOf(user)}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        {/* TODO: re-enable when Subscriptions is ready (re-add the CreditCard import).
        <DropdownMenuItem disabled>
          <CreditCard className="h-4 w-4" />
          Subscriptions
        </DropdownMenuItem>
        */}
        <DropdownMenuSeparator />
        <form action={logout}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit">
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
