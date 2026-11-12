import { Link } from "react-router";
import { openDb, topSecurities } from "../data.server";
import { formatChange, formatCrore, formatPrice } from "../format";
import type { Route } from "./+types/home";
import styles from "./home.module.css";

let db: ReturnType<typeof openDb> | undefined;

export async function loader() {
  db ??= openDb();
  return topSecurities(db);
}

export function meta() {
  return [{ title: "Top 30 Securities" }];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { tradeDate, securities } = loaderData;

  return (
    <main className="page">
      <h1>Top 30 Securities</h1>
      {securities.length === 0 ? (
        <p>
          No Issue Size data yet. Run <code>yarn fetch</code> and <code>yarn build</code>
        </p>
      ) : (
        <>
          <p className={styles.asOf}>By Market Cap on {tradeDate}</p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.num}>#</th>
                <th>Symbol</th>
                <th className={styles.num}>Market Cap</th>
                <th className={styles.num}>Close</th>
                <th className={styles.num}>1-day change</th>
              </tr>
            </thead>
            <tbody>
              {securities.map((s) => (
                <tr key={s.symbol} className={styles.row}>
                  <td className={styles.num}>{s.rank}</td>
                  <td>
                    {/* The link's ::after covers the whole row, so the whole row is clickable. */}
                    <Link to={`/companies/${encodeURIComponent(s.symbol)}`} className={styles.link}>
                      {s.symbol}
                    </Link>
                  </td>
                  <td className={styles.num}>{formatCrore(s.marketCapCr)}</td>
                  <td className={styles.num}>{formatPrice(s.close)}</td>
                  <td
                    className={`${styles.num} ${
                      s.changePct === null || s.changePct === 0
                        ? ""
                        : s.changePct > 0
                          ? styles.up
                          : styles.down
                    }`}
                  >
                    {formatChange(s.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
