const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache = { rates: null, fetchedAt: 0 };

/**
 * Fetches USD-based exchange rates from Frankfurter, with 1-hour in-memory cache.
 * Falls back to hardcoded rates if the network is unavailable.
 */
export const fetchExchangeRates = async (baseCurrency = "USD") => {
  const now = Date.now();
  if (baseCurrency === "USD" && _cache.rates && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.rates;
  }

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (baseCurrency === "USD") {
      _cache = { rates: data.rates, fetchedAt: now };
    }
    return data.rates;
  } catch (error) {
    console.error("[ExchangeRate] Failed to fetch live rates, using fallback:", error.message);
    return {
      USD: 1,
      EUR: 0.92,
      GBP: 0.78,
      CAD: 1.37,
      AUD: 1.51,
      CHF: 0.9,
      CZK: 23.1,
      DKK: 6.88,
      HUF: 357.12,
      NOK: 10.55,
      NZD: 1.63,
      PLN: 3.98,
      RON: 4.57,
      SEK: 10.42,
    };
  }
};
