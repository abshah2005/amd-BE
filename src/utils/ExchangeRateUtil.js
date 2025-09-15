export const fetchExchangeRates = async (baseCurrency = "USD") => {
  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`);
    const data = await response.json();
    return data.rates;
  } catch (error) {
    console.error("Error fetching rates:", error);
    // Fallback rates
    return {
      USD: 1,
      EUR: 0.92,
      GBP: 0.78,
      CAD: 1.37,
      AUD: 1.51,
      HUF: 357.12
    };
  }
};