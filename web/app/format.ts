const crore = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const price = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Market Cap in ₹ crore with Indian digit grouping, e.g. `18,07,135 Cr`. */
export function formatCrore(value: number): string {
  return `${crore.format(value)} Cr`;
}

/** A price in rupees with two decimals and Indian digit grouping, e.g. `1,234.50`. */
export function formatPrice(value: number): string {
  return price.format(value);
}

/** Which way a change reads once rounded to the two decimals shown: a `0.00%` is flat. */
export function changeDirection(pct: number | null): "up" | "down" | "flat" {
  if (pct === null) return "flat";
  const shown = Number(pct.toFixed(2));
  return shown > 0 ? "up" : shown < 0 ? "down" : "flat";
}

/** A signed percentage with two decimals, e.g. `+1.25%`, `-0.40%`; a dash when unknown. */
export function formatChange(pct: number | null): string {
  if (pct === null) return "–";
  const sign = changeDirection(pct) === "up" ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

const quantity = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** A share quantity with Indian digit grouping, e.g. `12,34,567`. */
export function formatQuantity(value: number): string {
  return quantity.format(value);
}
