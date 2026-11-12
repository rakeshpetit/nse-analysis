# Pipeline scope starts at September 2024

`files/` holds bhavcopies from January 2020, but before mid-2024 they are a mix of three header layouts that switch back and forth. Many come from a third-party merge (`...,ISIN,,DELIV_QTY,DELIV_PER`, a layout NSE never published), and several are holiday-named copies of other days. From September 2024 every file is NSE's `sec_bhavdata_full` layout. We decided the pipeline only covers Trading Days on or after 2024-09-01, so there is one loader and less to clean, at the cost of losing about four and a half years of history. Older files are ignored, not deleted.

## Consequences

- No ISIN is available, because `sec_bhavdata_full` doesn't carry it. Security identity relies on symbol plus NSE's `symbolchange.csv`.
- Only Corporate Actions with ex-dates in the window affect any bar.
- Extending backwards later means moving the configured start date and adding a loader for each older layout. NSE still serves `sec_bhavdata_full` back to 2020, which could replace the messy files if that's needed.

## Update

The files on disk from September 2024 are not NSE's `sec_bhavdata_full` layout. They are the 15-column layout written by `packages/stockdata/fetchBhavcopy.js` (`SYMBOL, SERIES, DATE1, …, DELIV_PER`). The pipeline's loader reads that layout and rejects any other header. The scope and consequences above still hold.
