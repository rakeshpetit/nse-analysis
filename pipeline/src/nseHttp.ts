import type { Http } from "./fetch";

/** A request that takes longer than this fails, so one hung connection cannot stall the whole run. */
const TIMEOUT_MS = 30_000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nseindia.com/",
};

/**
 * The real HTTP layer: a browser-like User-Agent on every request. NSE's `/api/` endpoints
 * refuse requests without the cookies its home page sets, so those are picked up once, lazily.
 */
export function nseHttp(): Http {
  let cookie: Promise<string> | undefined;
  const homeCookie = () => {
    cookie ??= fetch("https://www.nseindia.com/", { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for https://www.nseindia.com/`);
        return res.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
      })
      .catch((err) => {
        cookie = undefined; // a failed attempt must not poison every later request
        throw err;
      });
    return cookie;
  };

  return async (url) => {
    const headers: Record<string, string> = { ...HEADERS };
    if (new URL(url).pathname.startsWith("/api/")) headers.Cookie = await homeCookie();
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
  };
}
