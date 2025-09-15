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


export const getSymbolFromCurrencyCode = (code) => {
  const symbolMap = {
    "usd": "$",
    "eur": "€", 
    "gbp": "£",
    "cad": "C$",
    "aud": "A$",
    "huf": "Ft",
    "brl": "R$",
    "chf": "CHF",
    "cny": "¥",
    "czk": "Kč",
    "dkk": "kr",
    "hkd": "HK$",
    "inr": "₹",
    "jpy": "¥",
    "mxn": "Mex$",
    "nzd": "NZ$",
    "pln": "zł",
    "sek": "kr",
    "sgd": "S$",
    "thb": "฿",
    "try": "₺",
    "zar": "R"
  };

  return symbolMap[code.toLowerCase()] || "$";
};