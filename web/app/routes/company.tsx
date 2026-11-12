import { data, Link } from "react-router";
import { companyPrices, getDb } from "../data.server";
import { PriceChart } from "../PriceChart";
import { DEFAULT_RANGE, RANGES, type Range } from "../ranges";
import type { Route } from "./+types/company";
import styles from "./company.module.css";

function parseRange(value: string | null): Range {
  return RANGES.find((r) => r === value) ?? DEFAULT_RANGE;
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const range = parseRange(new URL(request.url).searchParams.get("range"));
  const prices = await companyPrices(getDb(), params.symbol, range);
  if (!prices) throw data("No Security trades under this symbol", { status: 404 });
  return { ...prices, range };
}

export function meta({ params, data }: Route.MetaArgs) {
  return [{ title: `${data?.name ?? params.symbol} · Adjusted Price` }];
}

export default function Company({ loaderData }: Route.ComponentProps) {
  const { symbol, name, bars, range } = loaderData;

  return (
    <main className="page">
      <p>
        <Link to="/">← Top 30 Securities</Link>
      </p>
      <h1>{name}</h1>
      {name !== symbol && <p className={styles.symbol}>{symbol}</p>}
      <nav className={styles.ranges} aria-label="Range">
        {RANGES.map((r) => (
          <Link
            key={r}
            to={`?range=${r}`}
            preventScrollReset
            replace
            className={styles.range}
            aria-current={r === range ? "true" : undefined}
          >
            {r}
          </Link>
        ))}
      </nav>
      {bars.length === 0 ? <p>No prices in this range.</p> : <PriceChart bars={bars} />}
      <p className={styles.note}>Adjusted close and volume, on today's share basis.</p>
    </main>
  );
}
