# NSE Equity Data Pipeline

Turns daily NSE bhavcopy files into a clean, split- and bonus-adjusted price history for listed equities, without ever modifying the source files.

## Sources

**Raw File**:
One daily bhavcopy CSV under `files/`, kept exactly as received. The pipeline only reads it.
_Avoid_: input file, data dump

**Bhavcopy**:
NSE's end-of-day summary of every instrument traded on one trading day, published in several layouts over the years.
_Avoid_: daily report

**Trading Day**:
A date on which NSE held a trading session, including special sessions (e.g. Saturday Budget or Muhurat sessions). It is the date written inside the bhavcopy, not the date in the file name.
_Avoid_: business day, file date

**Reference Snapshot**:
A dated, verbatim copy of an NSE reference list (corporate actions, symbol changes, name changes). Like a Raw File, it is never edited; newer snapshots supersede older ones.
_Avoid_: master data, lookup file

**Staged Row**:
One line of a Raw File loaded as-is, remembering the file and line it came from. Nothing is filtered or corrected at this stage.
_Avoid_: raw row, import row

## Instruments

**Security**:
One listed company's equity, followed across its whole history. It has a stable ID that is not its symbol, and a dated history of the symbols it has traded under, so a rename keeps it the same Security. Series is not part of its identity.
_Avoid_: stock (when precision matters), ticker, scrip

**Series**:
NSE's code for the trading segment a symbol trades in on a given day (EQ, BE, SM, GS, ...). Only EQ and BE are in scope; a Security moving between them stays the same Security.
_Avoid_: segment, category

## Prices

**Daily Bar**:
One Security's unadjusted prices and quantities for one Trading Day, in a single consistent shape regardless of which bhavcopy layout it came from.
_Avoid_: candle, OHLC row, clean row

**Quality Flag**:
A named reason a Daily Bar looks implausible (e.g. high below low). A flagged bar is kept, never deleted.
_Avoid_: error, bad row

## Adjustments

**Corporate Action**:
A company event that changes the number or value of its shares without changing what holders own in total: split, bonus, rights issue, demerger, consolidation. Dividends are not corporate actions here.
_Avoid_: event, split (when meaning any action)

**Action Interpretation**:
The structured meaning of one Corporate Action's free-text description (type, ratio, face values, issue price, or "not price-relevant"). Recorded once per distinct description and reused on every build.
_Avoid_: parsed action, LLM output

**Adjustment Factor**:
The ratio derived from one Corporate Action that historical prices are divided by, and quantities multiplied by, on dates before its ex-date.
_Avoid_: split ratio, multiplier

**Adjusted Price**:
A price expressed on today's share basis, derived from an unadjusted price and all later Adjustment Factors. It is always derived, never stored as an edit to the original.
_Avoid_: clean price, corrected price

**Suspected Break**:
A day-over-day price jump in the data that no recorded Corporate Action explains. It is a lead to review, never a change to the data on its own.
_Avoid_: anomaly, potential split

**Review Decision**:
A human ruling on a flagged case: add a missing Corporate Action, reject a wrong one, confirm a demerger's estimated factor, or dismiss a Suspected Break. Review Decisions are the only way a person changes pipeline output.
_Avoid_: manual fix, override, correction
