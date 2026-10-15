import { isPublicInstance } from '@ap/config';
import { notFound } from 'next/navigation';

// The guides describe the public bot and its Premium plan, so a self-hosted copy serves none.
export default function GuidesLayout({ children }: { children: React.ReactNode }) {
  if (!isPublicInstance) notFound();
  return children;
}
