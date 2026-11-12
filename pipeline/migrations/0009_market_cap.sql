-- One line of a Market Cap File, loaded as received. Every value is text, untrimmed. The totals
-- lines at the end of each file (Symbol Listed, Permitted, Total) are staged too: nothing is
-- filtered here. source_file is relative to files/ (so it starts with mcap/), line_number is
-- 1-based (the header is line 1).
CREATE TABLE staged.mcap_row (
  source_file     text    NOT NULL,
  line_number     integer NOT NULL,
  trade_date      text,
  symbol          text,
  series          text,
  security_name   text,
  category        text,
  last_trade_date text,
  face_value      text,
  issue_size      text,
  close_price     text,
  market_cap      text,
  PRIMARY KEY (source_file, line_number)
);

-- A Security's Issue Size on a Trading Day (EQ and BE only), with the Market Cap NSE printed for
-- it. Rebuilt from staged.mcap_row on every build; never edited in place.
CREATE TABLE core.issue_size (
  security_id     text    NOT NULL REFERENCES core.security,
  symbol          text    NOT NULL,
  trade_date      date    NOT NULL,
  series          text    NOT NULL,
  issue_size      bigint  NOT NULL,
  file_market_cap numeric NOT NULL,
  PRIMARY KEY (security_id, trade_date)
);
