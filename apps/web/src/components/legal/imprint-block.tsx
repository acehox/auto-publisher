import { entity } from '@/lib/legal/entity';
import { CompanyEmail, SupportPhone } from './links';

/**
 * The statutory company-identification block, as one dense paragraph in small muted
 * text. Every particular is mandatory, so prominence is the only thing left to
 * minimise — which is what the carefully-drafted Croatian SaaS comparables do too.
 *
 * Nothing here can be dropped. ZTD cl. 21(4) sentence 2 carries its whole list onto the
 * website (name, seat, registry court, registration number, and each bank's own name and
 * seat alongside the account number), and the cl. 21(5) chapeau adds share capital with
 * its paid-up status plus every board member. The cl. 21(7) reduced-disclosure
 * concession is drafted for business paper and does not reach websites, so it cannot
 * strip this down; cl. 630(1)(2) fines the company up to EUR 10,000 for omitting these.
 *
 * Both name forms appear together because cl. 21(2) permits the registered translation
 * only alongside the Croatian one — see `entity.name`.
 *
 * This is the only surface that publishes `entity.email`: ZEIT cl. 6(1) wants an address
 * for the service *provider*. Documents that promise a reply use `SupportEmail`
 * instead — the split is explained in ./links.tsx and must not be collapsed.
 *
 * The telephone number in the contact tail is the one item here ZTD cl. 21 does NOT require —
 * it rides along because ZEIT cl. 6 wants details permitting rapid contact, and it costs
 * nothing to include. Its actual driver is Paddle's seller policy, which is why the
 * prominent copy lives in the Contact section of /legal: a muted grey paragraph is not
 * "clearly on your website". Removing it from here would not breach ZTD cl. 21.
 */
export function ImprintBlock() {
  const bank = entity.banks[0];

  return (
    <p className="not-prose text-xs leading-relaxed text-slate-500">
      {entity.name.full}, abbreviated {entity.name.short} (registered English translation{' '}
      {entity.name.englishShort}), {entity.seat}. Registered in the court register of the{' '}
      {entity.registryCourt} under registration number (MBS) {entity.registrationNumber}. VAT
      identification number {entity.vatNumber}. Share capital {entity.shareCapital},{' '}
      {entity.shareCapitalPaidUp}. Management board: {entity.boardMembers.join(', ')}. Account held
      with {bank.name}, {bank.seat}, IBAN {bank.iban}. Contact: <CompanyEmail />, <SupportPhone />
    </p>
  );
}
