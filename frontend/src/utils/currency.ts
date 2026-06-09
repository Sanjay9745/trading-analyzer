/**
 * Get the correct currency symbol based on the stock ticker.
 * Indian stocks (.NS for NSE, .BO for BSE) use ₹
 * Everything else defaults to $
 */
export function getCurrencySymbol(ticker: string): string {
  if (!ticker) return '$';
  if (ticker.endsWith('.NS') || ticker.endsWith('.BO')) return '₹';
  return '$';
}

/**
 * Format a price with the correct currency symbol for the given ticker.
 */
export function formatPrice(ticker: string, price: number | null | undefined): string {
  if (price === null || price === undefined) return '--';
  const symbol = getCurrencySymbol(ticker);
  return `${symbol}${price.toFixed(2)}`;
}
