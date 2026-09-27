/**
 * The operating entity's registered particulars — the single source for every legal
 * document and the site footer. ZTD cl. 21(4)-(5) requires this exact set on a
 * company's website, and a second copy of any value is a second thing to get wrong.
 */
export const entity = {
  /**
   * Verbatim from the sudski registar extract: ZTD cl. 21(1) requires the name in the
   * form and content as registered, so never paraphrase or localize these.
   *
   * ZTD cl. 21(2) allows a registered translation only TOGETHER WITH the Croatian form,
   * so `englishShort` must never render alone — pair it with `short`, or use `short`.
   */
  name: {
    full: 'PWN društvo s ograničenom odgovornošću za računalno programiranje',
    short: 'PWN d.o.o.',
    englishFull: 'PWN limited liability company for computer programming',
    englishShort: 'PWN Ltd',
  },

  /** ZEIT cl. 6 + ZTD cl. 21(4). Must be a street address, not a PO box. */
  seat: 'Selska ulica 25, 42242 Tužno, Croatia',

  /** ZEIT cl. 6 wants the register number AND particulars of the register. */
  registryCourt: 'Trgovački sud u Varaždinu',
  registrationNumber: '070204056',

  /** ZEIT cl. 6 requires this because the company is VAT-registered (the duty is conditional). */
  vatNumber: 'HR08981682739',

  /**
   * ZTD cl. 21(5)(1) requires the amount AND a statement of whether it is paid up.
   * `shareCapitalPaidUp` is that statement — a phrase, not a second copy of the amount,
   * rendered as "Share capital {shareCapital}, {shareCapitalPaidUp}." If the capital is
   * ever only partly paid, it must name the unpaid part.
   */
  shareCapital: '2.500,00 EUR',
  shareCapitalPaidUp: 'paid up in full',

  /** ZTD cl. 21(5)(3): surname plus at least one forename of every board member. */
  boardMembers: ['Tomislav Hosni'],

  /** ZTD cl. 21(4) wants the bank's own name and seat as well as the account number. */
  banks: [
    {
      name: 'Zagrebačka banka d.d.',
      seat: 'Trg bana Josipa Jelačića 10, 10000 Zagreb, Croatia',
      iban: 'HR2523600001103098664',
    },
  ],

  /** ZEIT cl. 6: an electronic address permitting direct contact. A form does not satisfy it. */
  email: 'info@pwn.ltd',

  /**
   * Buyer-support telephone number. Published because Paddle's Seller Handbook requires
   * sellers to list "buyer support details (email and phone number) clearly on your
   * website"; the MSA reaches it through cl. 9.2 plus cl. 9.6(iii), which lets Paddle
   * suspend sales for unremedied non-compliance.
   *
   * NOT part of the ZTD cl. 21 registered-particulars set, so its presence in the imprint
   * is not mandatory. It is statutory elsewhere: ZZP čl. 60 st. 1 t. 2 (= CRD Art 6(1)(c))
   * requires it before any distance contract, so /legal, /hr and the model withdrawal form
   * must keep it.
   *
   * Stored in display format with spaces. The `tel:` href is derived, not stored twice.
   */
  phone: '+385 91 997 2984',
} as const;

/** Satisfies the ZTD cl. 21(2) joint-use rule. Never render `englishShort` alone. */
export const entityNameWithTranslation = `${entity.name.short} (${entity.name.englishShort})`;
