-- A Security's current company name, from the newest equity list Reference Snapshot (NSE's
-- EQUITY_L.csv). Only Securities whose current symbol is in that list have a row. Rebuilt on
-- every build; never edited in place.
CREATE TABLE core.security_name (
  security_id text PRIMARY KEY REFERENCES core.security,
  name        text NOT NULL
);
