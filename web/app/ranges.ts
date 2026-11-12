/** Chart ranges, each counted in calendar months back from the latest Trading Day. */
export const RANGES = ["3M", "6M", "1Y"] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = "1Y";

export const RANGE_MONTHS: Record<Range, number> = { "3M": 3, "6M": 6, "1Y": 12 };
