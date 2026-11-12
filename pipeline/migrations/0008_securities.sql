-- A Security keeps one stable ID across symbol changes. The ID is derived (a hash of
-- the first symbol the Security ever had in the Symbol Change snapshot or the data),
-- so a rebuild reproduces it. Rebuilt on every build; only Securities with Daily Bars
-- exist here.
CREATE TABLE core.security (
  security_id text PRIMARY KEY
);

-- The dated history of a Security's symbols. A symbol is held from from_date (inclusive;
-- -infinity for the first one) until to_date (exclusive; infinity for the current one).
-- Series is never part of identity, so a move between EQ and BE leaves this untouched.
CREATE TABLE core.security_symbol (
  security_id text NOT NULL REFERENCES core.security,
  symbol      text NOT NULL,
  from_date   date NOT NULL,
  to_date     date NOT NULL,
  PRIMARY KEY (security_id, from_date)
);
CREATE INDEX security_symbol_symbol ON core.security_symbol (symbol, from_date);

-- Everything below is derived, so it is emptied and rebuilt by the next build.
TRUNCATE core.daily_bar, core.daily_bar_flag, adjusted.daily_bar, adjusted.adjustment_factor,
         adjusted.suspected_break, adjusted.action_without_jump;

-- Daily Bars and everything derived from them belong to a Security. `symbol` stays as the
-- symbol the Security traded under that day (or, for an item, on its date).
ALTER TABLE core.daily_bar
  ADD COLUMN security_id text NOT NULL REFERENCES core.security,
  ADD CONSTRAINT daily_bar_security_day UNIQUE (security_id, trade_date);

ALTER TABLE adjusted.daily_bar ADD COLUMN security_id text NOT NULL;
ALTER TABLE adjusted.daily_bar DROP CONSTRAINT daily_bar_pkey, ADD PRIMARY KEY (security_id, trade_date);

ALTER TABLE adjusted.adjustment_factor ADD COLUMN security_id text NOT NULL;
ALTER TABLE adjusted.adjustment_factor DROP CONSTRAINT adjustment_factor_pkey, ADD PRIMARY KEY (security_id, ex_date);

ALTER TABLE adjusted.suspected_break ADD COLUMN security_id text NOT NULL;
ALTER TABLE adjusted.suspected_break DROP CONSTRAINT suspected_break_pkey, ADD PRIMARY KEY (security_id, trade_date);

ALTER TABLE adjusted.action_without_jump ADD COLUMN security_id text NOT NULL;
ALTER TABLE adjusted.action_without_jump DROP CONSTRAINT action_without_jump_pkey, ADD PRIMARY KEY (security_id, ex_date);
