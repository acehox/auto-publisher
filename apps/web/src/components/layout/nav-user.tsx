import Image from 'next/image';

export interface NavUser {
  name?: string | null;
  username?: string | null;
  image?: string | null;
}

export function displayNameOf(user: NavUser): string {
  return user.name ?? user.username ?? 'Account';
}

export function UserAvatar({ user, size = 32 }: { user: NavUser; size?: number }) {
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="rounded-full"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-blue-600"
      style={{ width: size, height: size }}
    >
      <span className="text-white text-xs font-semibold">
        {displayNameOf(user).charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

export const loginButtonClass =
  'bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 border-0';
