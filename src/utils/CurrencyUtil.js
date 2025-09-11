export const getCurrencyCodeFromSymbol = (symbol) => {
  const currencyMap = {
    "$": "usd",
    "€": "eur",
    "£": "gbp",
    "C$": "cad", // Canadian Dollar
    "A$": "aud", // Australian Dollar
    "Ft": "huf", // Hungarian Forint
  };

  return currencyMap[symbol] || "usd";
};
