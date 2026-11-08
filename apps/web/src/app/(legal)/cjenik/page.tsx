import { isPublicInstance } from '@ap/config';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPriceLists } from '@/lib/api/backend';
import { priceListFileName, priceListPublishedAt } from '@/lib/price-list';

export const metadata: Metadata = {
  title: 'Cjenik',
  robots: { index: false },
};

const fileLink = (fileName: string) => (
  <a href={`/cjenik/${encodeURIComponent(fileName)}`}>{fileName}</a>
);

export default async function PriceListPage() {
  // A self-hosted instance sells nothing.
  if (!isPublicInstance) notFound();

  const [current, ...archived] = await getPriceLists();

  return (
    <div lang="hr">
      <h1>Cjenik</h1>
      {current ? (
        <>
          <p>
            Važeći cjenik usluga, objavljen {priceListPublishedAt(current)}:{' '}
            {fileLink(priceListFileName(current))}
          </p>
          {archived.length > 0 && (
            <>
              <h2>Arhiva cjenika</h2>
              <ul>
                {archived.map(list => (
                  <li key={list.storageNumber}>{fileLink(priceListFileName(list))}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p>Cjenik još nije objavljen.</p>
      )}
    </div>
  );
}
