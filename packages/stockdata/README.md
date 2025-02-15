# NSE data Analysis

## Repos that can help with NSE/BSE data

- To download the data <https://github.com/girishg4t/bhavCopy-downloader>
- Downloaded data <https://github.com/girishg4t/nse-bse-bhavcopy/tree/master>

## Next up

- Backup Postgres data so that it can be recovered easily
- Adjust prices for splits/bonuses

## Stock database tables

### Stock prices table

```sql
CREATE TABLE stock_data (
    id SERIAL PRIMARY KEY,  
    symbol VARCHAR(10),
    series VARCHAR(10),
    prev_close NUMERIC,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    date DATE,
    UNIQUE (symbol, date) 
);
```

### Stock splits table

```sql
CREATE TABLE stock_splits (
    symbol TEXT NOT NULL,
    split_date TIMESTAMP NOT NULL,
    split_ratio NUMERIC NOT NULL,
    PRIMARY KEY (symbol, split_date)
);
```

## Backup/Restore stock data

### Backing up data

```sql
CREATE TABLE backup_stock_data AS
SELECT * FROM stock_data
WHERE 1=0;

INSERT INTO backup_stock_data
SELECT * FROM stock_data;
```

### Restoring data

```sql
CREATE TABLE stock_data AS
SELECT * FROM backup_stock_data
WHERE 1=0;

INSERT INTO stock_data
SELECT * FROM backup_stock_data;
```

## Adjusting for splits/bonuses

Script to detect all potential anomalies in price between two consecutive dates
and insert them in the `stock_splits` table.This data can be updated with the
appropriate splits manually and then `stock_data` can be reupdated with the
correct prices.

```sql
WITH price_changes AS (
    SELECT
        symbol,
        date,
        close,
        LEAD(close) OVER (PARTITION BY symbol ORDER BY date) AS next_close
    FROM stock_data
),
potential_splits AS (
    SELECT
        symbol,
        date AS split_date,
        close,
        next_close,
        (close - next_close) / close AS price_drop_ratio
    FROM price_changes
    WHERE (close - next_close) / close BETWEEN 0.2 AND 0.9
)
INSERT INTO stock_splits (symbol, split_date, split_ratio)
SELECT
    symbol,
    split_date,
    1.0 AS split_ratio 
FROM potential_splits;
```

- Identify the split date and the split ratio. 1:1 split means the price is
  halved, so ratio is 2
- Update the historical prices for the symbol 'RELIANCE' and round to 2 decimal
  places

```sql

WITH split_info AS (
    SELECT 
        '2024-10-28T00:00:00.000Z'::timestamp AS split_date,
        2 AS split_ratio 
)


UPDATE stock_data
SET 
    prev_close = ROUND(prev_close / split_ratio, 2),
    open = ROUND(open / split_ratio, 2),
    high = ROUND(high / split_ratio, 2),
    low = ROUND(low / split_ratio, 2),
    close = ROUND(close / split_ratio, 2)
FROM split_info
WHERE 
    symbol = 'RELIANCE' 
    AND date < split_info.split_date;
```
