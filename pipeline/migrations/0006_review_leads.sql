-- Leads for the review queue (`pipeline review`), derived on every build and never
-- edited by hand. A person rules on them with Review Decisions (#0007).

-- A day-over-day move in Adjusted Prices bigger than the jump threshold, which
-- no applied Corporate Action explains (applied ones are already in the prices).
-- trade_date is the later day of the pair; prev_* describe the bar before it.
CREATE TABLE adjusted.suspected_break (
  symbol          text    NOT NULL,
  trade_date      date    NOT NULL,
  prev_trade_date date    NOT NULL,
  prev_close      numeric NOT NULL,
  open            numeric NOT NULL,
  close           numeric NOT NULL,
  open_change     numeric NOT NULL,
  close_change    numeric NOT NULL,
  PRIMARY KEY (symbol, trade_date)
);

-- An applied Corporate Action (one that changes prices, factor <> 1) whose ex-date
-- shows no matching price jump in the unadjusted Daily Bars: the last bar before
-- the ex-date against the first bar on or after it. The action may be wrong,
-- or the ratio, or the ex-date. The prices shown are unadjusted.
CREATE TABLE adjusted.action_without_jump (
  symbol          text    NOT NULL,
  ex_date         date    NOT NULL,
  factor          numeric NOT NULL,
  prev_trade_date date    NOT NULL,
  prev_close      numeric NOT NULL,
  trade_date      date    NOT NULL,
  open            numeric NOT NULL,
  close           numeric NOT NULL,
  PRIMARY KEY (symbol, ex_date)
);
