-- One line of a Raw File, loaded as received. Every value is text, untrimmed.
-- (source_file, line_number) is the line's address: source_file is relative to
-- the files/ directory and line_number is 1-based (the header is line 1).
CREATE TABLE staged.bhavcopy_row (
  source_file   text    NOT NULL,
  line_number   integer NOT NULL,
  symbol        text,
  series        text,
  date1         text,
  prev_close    text,
  open_price    text,
  high_price    text,
  low_price     text,
  last_price    text,
  close_price   text,
  avg_price     text,
  ttl_trd_qnty  text,
  turnover_lacs text,
  no_of_trades  text,
  deliv_qty     text,
  deliv_per     text,
  PRIMARY KEY (source_file, line_number)
);
