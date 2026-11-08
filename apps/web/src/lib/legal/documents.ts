export type LegalLanguage = 'en' | 'hr';

interface LegalDocument {
  href: string;
  label: string;
  /** Unset = English. Set so the link carries `lang`/`hrefLang` for a page in another language. */
  lang?: LegalLanguage;
  /** Linked only for `croatianVisitor`. The page itself stays reachable from anywhere. */
  croatianVisitorsOnly?: true;
}

/**
 * The published legal documents, in the order a reader most likely needs them, then the
 * price list Croatian law requires on the website (`lib/price-list.ts`).
 * Single source for the legal route group's nav, the site footer and the sitemap, so a
 * renamed route cannot leave a dead footer link behind.
 */
export const legalDocuments: readonly LegalDocument[] = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refunds', label: 'Refunds & Withdrawal Policy' },
  { href: '/legal', label: 'Legal Notice' },
  { href: '/hr', label: 'Hrvatski', lang: 'hr' },
  { href: '/cjenik', label: 'Cjenik', lang: 'hr', croatianVisitorsOnly: true },
];

/** The sitemap's documents. The Croatian pages are `noindex`. */
export const englishLegalDocuments = legalDocuments.filter(document => !document.lang);

/**
 * The footer's documents: the English ones plus the price list, where inspectors and price
 * scrapers look for it. The Croatian notice stays out: ZZP čl. 60 st. 9 owes it before the
 * contract, which the `hrvatski` link beside the checkout acceptance delivers to every buyer,
 * so a footer link only adds clutter. That holds while the subscription panel is the only way
 * to start a checkout — a second purchase path needs its own link. Never gate that checkout
 * link by country: the duty follows the consumer, not their IP (AUT-114).
 */
export const footerLegalDocuments = legalDocuments.filter(
  document => !document.lang || document.croatianVisitorsOnly
);

export const linkedFor = (
  documents: readonly LegalDocument[],
  croatianVisitor: boolean
): LegalDocument[] =>
  documents.filter(document => croatianVisitor || !document.croatianVisitorsOnly);

/**
 * Effective dates, kept here rather than inside each .mdx file so there is one place to
 * audit and so no document can silently ship claiming an effective date that predates
 * its own text.
 *
 * PRE-PUBLISH: every value must be a real date before these pages go live.
 * `null` renders as an explicit draft marker rather than a plausible-looking date.
 */
export const legalEffectiveDates: Record<string, string | null> = {
  '/terms': '2026-10-09',
  '/privacy': '2026-09-28',
  '/refunds': '2026-09-28',
  '/legal': '2026-09-28',
  '/hr': '2026-10-09',
};

/**
 * Version identifier for the documents presented at checkout — the Terms + Refunds pair
 * and the Croatian notice (/hr) that restates their pre-contractual information — recorded
 * with every purchase so we can show *which* wording a given buyer accepted.
 *
 * Deliberately a standalone constant rather than a read of `legalEffectiveDates`:
 * those can be `null` in draft, and the acceptance gate has to produce a usable
 * version string in draft too. Bump this whenever any of the three changes materially;
 * set it to the effective date when the documents go live.
 *
 * Not mirrored server-side on purpose. The backend records what the client asserts
 * and stamps its own timestamp beside it — it cannot know what wording a browser
 * actually rendered, so comparing against a server copy would add a deploy-skew
 * failure mode without adding any evidential weight. The gate that matters is the
 * server requiring acceptance at all.
 */
export const LEGAL_DOCUMENTS_VERSION = '2026-10-09';
