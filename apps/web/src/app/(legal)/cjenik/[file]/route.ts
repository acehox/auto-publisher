import { isPublicInstance } from '@ap/config';
import { getPriceLists } from '@/lib/api/backend';
import { CURRENT_PRICE_LIST_FILE, priceListCsv, priceListFileName } from '@/lib/price-list';

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  if (!isPublicInstance) return new Response(null, { status: 404 });

  const lists = await getPriceLists();
  const requested = decodeURIComponent((await params).file);
  const list =
    requested === CURRENT_PRICE_LIST_FILE
      ? lists[0]
      : lists.find(list => priceListFileName(list) === requested);
  if (!list) return new Response(null, { status: 404 });

  return new Response(priceListCsv(list), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${priceListFileName(list)}"`,
    },
  });
}
