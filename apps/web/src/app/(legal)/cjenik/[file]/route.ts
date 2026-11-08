import { isPublicInstance } from '@ap/config';
import { getPriceLists } from '@/lib/api/backend';
import { priceListCsv, priceListFileName } from '@/lib/price-list';

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!isPublicInstance) return new Response(null, { status: 404 });

  const requested = decodeURIComponent((await params).file);
  const list = (await getPriceLists()).find(list => priceListFileName(list) === requested);
  if (!list) return new Response(null, { status: 404 });

  return new Response(priceListCsv(list), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' },
  });
}
