-- One Security's unadjusted prices and quantities for one Trading Day.
-- Rebuilt from staged.bhavcopy_row on every build; never edited in place.
CREATE TABLE core.daily_bar (
  symbol           text    NOT NULL,
  trade_date       date    NOT NULL,
  series           text    NOT NULL,
  prev_close       numeric NOT NULL,
  open             numeric NOT NULL,
  high             numeric NOT NULL,
  low              numeric NOT NULL,
  last             numeric NOT NULL,
  close            numeric NOT NULL,
  avg_price        numeric,
  traded_qty       bigint  NOT NULL,
  turnover_lacs    numeric NOT NULL,
  trades           bigint  NOT NULL,
  delivery_qty     bigint,
  delivery_pct     numeric,
  PRIMARY KEY (symbol, trade_date)
);
