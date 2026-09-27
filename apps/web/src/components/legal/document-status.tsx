import { AlertTriangle } from 'lucide-react';
import { type LegalLanguage, legalEffectiveDates } from '@/lib/legal/documents';

const strings: Record<
  LegalLanguage,
  { draftTitle: string; draftBody: string; effectiveFrom: string; locale: string }
> = {
  en: {
    draftTitle: 'Draft — not in force.',
    draftBody:
      'This document is unfinished, has not been reviewed, and does not bind anyone. It may contain unfilled placeholders.',
    effectiveFrom: 'Effective from',
    locale: 'en-US',
  },
  hr: {
    draftTitle: 'Nacrt — nije na snazi.',
    draftBody: 'Ovaj dokument nije dovršen ni pregledan i nikoga ne obvezuje.',
    effectiveFrom: 'Na snazi od',
    locale: 'hr-HR',
  },
};

/**
 * Renders a document's effective date, or a draft warning when it has none. One
 * component for both states on purpose: setting the date in `legalEffectiveDates` is
 * what flips it, so there is no separate banner to remember to delete — and a document
 * cannot silently read as in force while still holding placeholders.
 */
export function DocumentStatus({
  document,
  lang = 'en',
}: {
  document: string;
  lang?: LegalLanguage;
}) {
  const effectiveDate = legalEffectiveDates[document];
  const text = strings[lang];

  if (!effectiveDate) {
    return (
      <div className="not-prose flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold text-amber-100">{text.draftTitle}</strong>{' '}
          {text.draftBody}
        </p>
      </div>
    );
  }

  return (
    <p className="not-prose text-sm text-slate-500">
      {text.effectiveFrom}{' '}
      <time dateTime={effectiveDate}>
        {new Date(`${effectiveDate}T00:00:00Z`).toLocaleDateString(text.locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC',
        })}
      </time>
    </p>
  );
}
