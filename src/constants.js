export const DB_NAME='AMD4';

// Stripe settlement currencies enabled in the platform's connected-account settings.
// Any country whose default currency is NOT in this set must be blocked at onboarding
// so that transfers never fail with an unsupported-currency error.
export const SUPPORTED_STRIPE_CURRENCIES = new Set([
  "usd", "aud", "cad", "chf", "czk", "dkk",
  "eur", "gbp", "huf", "nok", "nzd", "pln", "ron", "sek",
]);

// Maps Stripe-accepted country codes to their platform settlement currency.
// Only countries whose currency appears in SUPPORTED_STRIPE_CURRENCIES are listed;
// all others are blocked at onboarding time.
export const COUNTRY_TO_CURRENCY = {
  // USD
  US: "usd",
  // AUD
  AU: "aud",
  // CAD
  CA: "cad",
  // CHF — Switzerland and Liechtenstein
  CH: "chf",
  LI: "chf",
  // CZK
  CZ: "czk",
  // DKK
  DK: "dkk",
  // EUR — euro-zone countries supported by Stripe Express (incl. Croatia which joined 2023)
  AT: "eur", BE: "eur", HR: "eur", CY: "eur", EE: "eur", FI: "eur",
  FR: "eur", DE: "eur", GR: "eur", IE: "eur", IT: "eur",
  LV: "eur", LT: "eur", LU: "eur", MT: "eur", NL: "eur",
  PT: "eur", SK: "eur", SI: "eur", ES: "eur",
  // GBP
  GB: "gbp",
  // HUF
  HU: "huf",
  // NOK
  NO: "nok",
  // NZD
  NZ: "nzd",
  // PLN
  PL: "pln",
  // RON
  RO: "ron",
  // SEK
  SE: "sek",
};