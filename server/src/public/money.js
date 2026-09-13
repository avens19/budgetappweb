/*
 * Which currency to write an amount in.
 *
 * A budget is a bare number on the wire — the API has no currency field and
 * nothing here converts between currencies. The only question is which symbol
 * to put in front of the number, and the two phone apps already answer it the
 * same way: ask the platform what the device is set to (Android's
 * NumberFormat.getCurrencyInstance(), iOS's Locale.current.currency) and print
 * that. The web asked Intl for USD instead, which is how a budget kept in
 * Calgary came out reading "US$161.00" — Intl disambiguates the dollar for
 * every locale that is not American.
 *
 * The browser has no equivalent of that platform call. Intl will format any
 * currency you name but will not tell you which one a locale spends, so the
 * table below stands in for the CLDR data the phones get for free. It covers
 * the countries the apps are installed in; an unlisted region falls back to a
 * plain "$", which is as vague as the old code but no longer claims to be
 * American about it.
 *
 * It binds itself onto globalThis rather than exporting, for the same reason
 * weekly-number.js does: the page loads it with a plain <script> tag, and
 * test/money.test.js imports it for the side effect and reads the same global.
 */
(function (root) {
  'use strict';

  /* ISO 3166 region to ISO 4217 currency. Deliberately omits a country whose
   * currency is mid-redenomination (Zimbabwe) rather than shipping a code that
   * will be wrong within the year. */
  var CURRENCY_BY_REGION = {
    AD: 'EUR', AE: 'AED', AF: 'AFN', AL: 'ALL', AM: 'AMD', AO: 'AOA',
    AR: 'ARS', AT: 'EUR', AU: 'AUD', AZ: 'AZN', BA: 'BAM', BB: 'BBD',
    BD: 'BDT', BE: 'EUR', BF: 'XOF', BG: 'BGN', BH: 'BHD', BI: 'BIF',
    BJ: 'XOF', BN: 'BND', BO: 'BOB', BR: 'BRL', BS: 'BSD', BT: 'BTN',
    BW: 'BWP', BY: 'BYN', BZ: 'BZD', CA: 'CAD', CD: 'CDF', CF: 'XAF',
    CG: 'XAF', CH: 'CHF', CI: 'XOF', CL: 'CLP', CM: 'XAF', CN: 'CNY',
    CO: 'COP', CR: 'CRC', CU: 'CUP', CV: 'CVE', CY: 'EUR', CZ: 'CZK',
    DE: 'EUR', DJ: 'DJF', DK: 'DKK', DO: 'DOP', DZ: 'DZD', EC: 'USD',
    EE: 'EUR', EG: 'EGP', ER: 'ERN', ES: 'EUR', ET: 'ETB', FI: 'EUR',
    FJ: 'FJD', FR: 'EUR', GA: 'XAF', GB: 'GBP', GE: 'GEL', GH: 'GHS',
    GM: 'GMD', GN: 'GNF', GQ: 'XAF', GR: 'EUR', GT: 'GTQ', GW: 'XOF',
    GY: 'GYD', HK: 'HKD', HN: 'HNL', HR: 'EUR', HT: 'HTG', HU: 'HUF',
    ID: 'IDR', IE: 'EUR', IL: 'ILS', IN: 'INR', IQ: 'IQD', IR: 'IRR',
    IS: 'ISK', IT: 'EUR', JM: 'JMD', JO: 'JOD', JP: 'JPY', KE: 'KES',
    KG: 'KGS', KH: 'KHR', KR: 'KRW', KW: 'KWD', KZ: 'KZT', LA: 'LAK',
    LB: 'LBP', LI: 'CHF', LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR',
    LU: 'EUR', LV: 'EUR', LY: 'LYD', MA: 'MAD', MC: 'EUR', MD: 'MDL',
    ME: 'EUR', MG: 'MGA', MK: 'MKD', ML: 'XOF', MM: 'MMK', MN: 'MNT',
    MO: 'MOP', MR: 'MRU', MT: 'EUR', MU: 'MUR', MV: 'MVR', MW: 'MWK',
    MX: 'MXN', MY: 'MYR', MZ: 'MZN', NA: 'NAD', NC: 'XPF', NE: 'XOF',
    NG: 'NGN', NI: 'NIO', NL: 'EUR', NO: 'NOK', NP: 'NPR', NZ: 'NZD',
    OM: 'OMR', PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP',
    PK: 'PKR', PL: 'PLN', PR: 'USD', PS: 'ILS', PT: 'EUR', PY: 'PYG',
    QA: 'QAR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF', SA: 'SAR',
    SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD', SI: 'EUR',
    SK: 'EUR', SL: 'SLE', SM: 'EUR', SN: 'XOF', SO: 'SOS', SR: 'SRD',
    ST: 'STN', SV: 'USD', SY: 'SYP', SZ: 'SZL', TD: 'XAF', TG: 'XOF',
    TH: 'THB', TJ: 'TJS', TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY',
    TT: 'TTD', TW: 'TWD', TZ: 'TZS', UA: 'UAH', UG: 'UGX', US: 'USD',
    UY: 'UYU', UZ: 'UZS', VA: 'EUR', VE: 'VES', VN: 'VND', VU: 'VUV',
    WS: 'WST', XK: 'EUR', YE: 'YER', ZA: 'ZAR', ZM: 'ZMW'
  };

  /* What the reader's browser is set to. This is the device's locale and not
   * the language the site is being read in: someone in Montreal who switches
   * the site to English is still spending Canadian dollars. */
  function currentLocale() {
    try {
      return new Intl.NumberFormat().resolvedOptions().locale;
    } catch (e) {
      return '';
    }
  }

  /* A bare "en" carries no country, and plenty of browsers send exactly that.
   * maximize() applies CLDR's likely subtags — en to en-Latn-US, pt to
   * pt-Latn-BR — which is the same guess the phones make. */
  function regionOf(locale) {
    try {
      var tag = new Intl.Locale(locale || currentLocale());
      return tag.region || tag.maximize().region || '';
    } catch (e) {
      return '';
    }
  }

  function currencyFor(locale) {
    return CURRENCY_BY_REGION[regionOf(locale)] || null;
  }

  /* An amount, in the reader's currency and their number format. The fraction
   * digits are the currency's own — two for dollars and euros, none for yen —
   * which is what the Android client does with the same amounts. */
  function format(value, locale) {
    var currency = currencyFor(locale);
    try {
      if (currency) {
        return new Intl.NumberFormat(locale, {
          style: 'currency', currency: currency
        }).format(value);
      }
      /* Nowhere to look the currency up, so print the grouping and separator
       * the locale wants around a symbol that names no country. Formatting as
       * USD and swapping the currency part out is the only way to keep the
       * placement right: the symbol leads in English and trails in French. */
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency: 'USD', minimumFractionDigits: 2
      }).formatToParts(value).map(function (part) {
        return part.type === 'currency' ? '$' : part.value;
      }).join('');
    } catch (e) {
      return '$' + value.toFixed(2);
    }
  }

  root.Money = {
    CURRENCY_BY_REGION: CURRENCY_BY_REGION,
    currencyFor: currencyFor,
    regionOf: regionOf,
    format: format
  };
}(globalThis));
