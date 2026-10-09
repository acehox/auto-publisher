export type LegalLanguage = 'en' | 'hr';

interface LegalDocument {
  href: string;
  label: string;
  /** Unset = English. Set so the link carries `lang`/`hrefLang` for a page in another language. */
  lang?: LegalLanguage;
}

/**
 * The five published legal documents, in the order a reader most likely needs them.
 * Single source for the legal route group's nav and the site footer, so a renamed route
 * cannot leave a dead footer link behind.
 */
export const legalDocuments: readonly LegalDocument[] = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refunds', label: 'Refunds & Withdrawal Policy' },
  { href: '/legal', label: 'Legal Notice' },
  { href: '/hr', label: 'Hrvatski', lang: 'hr' },
];

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
