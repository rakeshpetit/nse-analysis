-- A named reason one Daily Bar looks implausible. A bar can carry several flags;
-- flagged bars stay in core.daily_bar untouched. Rebuilt on every build.
CREATE TABLE core.daily_bar_flag (
  symbol     text NOT NULL,
  trade_date date NOT NULL,
  flag       text NOT NULL,
  PRIMARY KEY (symbol, trade_date, flag),
  FOREIGN KEY (symbol, trade_date) REFERENCES core.daily_bar (symbol, trade_date)
);

-- How many Daily Bars carry each flag, across all bars.
CREATE VIEW core.quality_flag_count AS
SELECT flag, count(*) AS bars
FROM core.daily_bar_flag
GROUP BY flag
ORDER BY flag;
