import { links } from '@/lib/constants';
import { entity } from '@/lib/legal/entity';

/**
 * Link helpers for the .mdx legal documents.
 *
 * These exist because MDX does not evaluate expressions inside a markdown link
 * destination: `[text](mailto:{entity.email})` ships the literal
 * `mailto:%7Bentity.email%7D` as the href. It renders plausibly and fails silently, so
 * anything with a computed href must be JSX.
 *
 * The two addresses are not interchangeable. `CompanyEmail` is the legal entity's own
 * address, published because ZEIT cl. 6(1) requires one for the service provider, and it
 * appears only in the imprint. `SupportEmail` is the monitored inbox, so every duty that
 * is about being *answered* points there: ZZP cl. 10 complaints, GDPR Arts 15-22
 * requests, withdrawal notices, security reports. Naming different addresses is lawful —
 * what matters is that whichever one a document names is actually monitored.
 */

/** The statutory company address. Imprint only — see the note above. */
export function CompanyEmail() {
  return <a href={`mailto:${entity.email}`}>{entity.email}</a>;
}

/** The monitored support inbox. Everything a person expects a reply to. */
export function SupportEmail() {
  return <a href={`mailto:${links.supportEmail}`}>{links.supportEmail}</a>;
}

/**
 * The buyer-support telephone number. One number serves both the support role and the
 * imprint's contact tail, so it is stored once and the `tel:` target is derived here —
 * a second literal with the spaces removed is a second thing to get wrong.
 */
export function SupportPhone() {
  return <a href={`tel:${entity.phone.replace(/\s/g, '')}`}>{entity.phone}</a>;
}

/*
 * No support-server link here on purpose: a statutory contact has to accept written
 * notice, and a chat server does not. The footer and the marketing surfaces link it.
 */

/** The public source repository. */
export function RepositoryLink({ children }: { children?: React.ReactNode }) {
  return (
    <a href={links.githubRepo} target="_blank" rel="noopener noreferrer">
      {children ?? 'GitHub'}
    </a>
  );
}
