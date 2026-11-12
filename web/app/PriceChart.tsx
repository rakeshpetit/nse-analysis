import { useEffect, useRef, useState } from "react";
import type { PriceBar } from "./data.server";
import { formatPrice } from "./format";
import styles from "./PriceChart.module.css";

const TOOLTIP_WIDTH_PX = 168;
const TOOLTIP_GAP_PX = 16;

/** Adjusted close as a line; hovering shows that day's Adjusted open, high, low and close. */
export function PriceChart({ bars }: { bars: PriceBar[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<{ bar: PriceBar; left: number } | null>(null);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;

    // Loaded here so the server render never touches the DOM-only charting library.
    import("lightweight-charts").then(({ createChart, LineSeries, ColorType }) => {
      if (cancelled) return;
      const css = getComputedStyle(document.documentElement);
      const colors = () => ({
        muted: css.getPropertyValue("--muted").trim(),
        line: css.getPropertyValue("--line").trim(),
        accent: css.getPropertyValue("--accent").trim(),
      });
      const layoutOptions = () => {
        const c = colors();
        return {
          layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: c.muted },
          grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
          rightPriceScale: { borderColor: c.line },
          timeScale: { borderColor: c.line },
        };
      };

      const chart = createChart(el, { ...layoutOptions(), autoSize: true });
      const series = chart.addSeries(LineSeries, {
        color: colors().accent,
        lineWidth: 2,
        priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      });
      series.setData(bars.map((b) => ({ time: b.date, value: b.close })));
      chart.timeScale().fitContent();

      const byDate = new Map(bars.map((b) => [b.date, b]));
      chart.subscribeCrosshairMove((param) => {
        const bar = typeof param.time === "string" ? byDate.get(param.time) : undefined;
        if (!bar || !param.point) return setHovered(null);
        const furthestLeft = el.clientWidth - TOOLTIP_WIDTH_PX;
        setHovered({ bar, left: Math.max(0, Math.min(param.point.x + TOOLTIP_GAP_PX, furthestLeft)) });
      });

      const scheme = window.matchMedia("(prefers-color-scheme: dark)");
      const restyle = () => {
        chart.applyOptions(layoutOptions());
        series.applyOptions({ color: colors().accent });
      };
      scheme.addEventListener("change", restyle);
      dispose = () => {
        scheme.removeEventListener("change", restyle);
        chart.remove();
      };
    }).catch((error: unknown) => console.error("Could not load the chart", error));

    return () => {
      cancelled = true;
      dispose?.();
      setHovered(null);
    };
  }, [bars]);

  return (
    <div className={styles.wrap}>
      <div ref={container} className={styles.chart} data-testid="price-chart" />
      {hovered && (
        <dl
          className={styles.tooltip}
          style={{ left: hovered.left, width: TOOLTIP_WIDTH_PX }}
        >
          <dt className={styles.date}>{hovered.bar.date}</dt>
          <dd>
            <span>Open</span> {formatPrice(hovered.bar.open)}
          </dd>
          <dd>
            <span>High</span> {formatPrice(hovered.bar.high)}
          </dd>
          <dd>
            <span>Low</span> {formatPrice(hovered.bar.low)}
          </dd>
          <dd>
            <span>Close</span> {formatPrice(hovered.bar.close)}
          </dd>
        </dl>
      )}
    </div>
  );
}
