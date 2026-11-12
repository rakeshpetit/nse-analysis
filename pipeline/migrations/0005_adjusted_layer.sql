CREATE SCHEMA adjusted;

-- One row per Security and ex-date: the combined Adjustment Factor of every
-- Corporate Action going ex that day (as the fraction factor_num / factor_den),
-- and the cumulative factor of this and all later ex-dates. Bars dated before
-- ex_date and on/after the previous ex-date are divided by the cumulative one.
-- Rebuilt on every build.
CREATE TABLE adjusted.adjustment_factor (
  symbol         text    NOT NULL,
  ex_date        date    NOT NULL,
  factor_num     numeric NOT NULL,
  factor_den     numeric NOT NULL,
  factor         numeric GENERATED ALWAYS AS (factor_num / factor_den) STORED,
  cumulative_num numeric NOT NULL,
  cumulative_den numeric NOT NULL,
  PRIMARY KEY (symbol, ex_date)
);

-- core.daily_bar expressed on today's share basis. Derived from Daily Bars and
-- Adjustment Factors on every build; core.daily_bar itself is never changed
-- (ADR 0001). Prices are divided by the factor, traded and delivery quantities
-- multiplied; turnover, trades and delivery % are unchanged. Quantities are
-- numeric because a fractional factor (e.g. bonus 1:2) gives fractional shares.
CREATE TABLE adjusted.daily_bar (
  symbol        text    NOT NULL,
  trade_date    date    NOT NULL,
  series        text    NOT NULL,
  factor        numeric NOT NULL,
  prev_close    numeric NOT NULL,
  open          numeric NOT NULL,
  high          numeric NOT NULL,
  low           numeric NOT NULL,
  last          numeric NOT NULL,
  close         numeric NOT NULL,
  avg_price     numeric,
  traded_qty    numeric NOT NULL,
  turnover_lacs numeric NOT NULL,
  trades        bigint  NOT NULL,
  delivery_qty  numeric,
  delivery_pct  numeric,
  PRIMARY KEY (symbol, trade_date)
);

-- Quality Flags describe the bar as traded, so they carry over unchanged.
CREATE VIEW adjusted.daily_bar_flag AS
SELECT symbol, trade_date, flag FROM core.daily_bar_flag;
