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

/** A signed percentage with two decimals, e.g. `+1.25%`, `-0.40%`; a dash when unknown. */
export function formatChange(pct: number | null): string {
  if (pct === null) return "–";
  const rounded = pct.toFixed(2);
  return `${pct > 0 && rounded !== "0.00" ? "+" : ""}${rounded}%`;
}
