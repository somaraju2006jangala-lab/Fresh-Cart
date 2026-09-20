/**
 * Currency utility for Indian Rupees (₹ / INR) formatting.
 * Uses Intl.NumberFormat with 'en-IN' locale and 'INR' currency.
 * Formats integers without unnecessary trailing decimals (e.g. ₹99, ₹499, ₹1,299, ₹10,999)
 * and formats fractional values with 2 decimals (e.g. ₹49.50).
 */
export const formatINR = (amount: number, forceDecimals = false): string => {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0';
  }

  const hasDecimals = amount % 1 !== 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: hasDecimals || forceDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals || forceDecimals ? 2 : 0,
  }).format(amount);
};
