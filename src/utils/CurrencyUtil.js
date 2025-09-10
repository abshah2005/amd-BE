export const getCurrencyCodeFromSymbol = (symbol) => {
  const currencyMap = {
    "$": "usd",
    "€": "eur",
    "£": "gbp",
    "¥": "jpy",
    "₹": "inr",
    "₩": "krw",
    "₽": "rub",
    "₺": "try",
    "₪": "ils",
    "₫": "vnd",
    "₦": "ngn",
    "฿": "thb",
    "₵": "ghs",
    "₴": "uah",
    "₸": "kzt",
    "₡": "crc",
    "₱": "php",
    "₭": "lak",
    "₲": "pyg",
    "₼": "azn",
    "₺": "try",
  };

  return currencyMap[symbol] || "usd";
};
