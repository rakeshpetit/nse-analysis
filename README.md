# NSE data Analysis

## Repos that can help with NSE/BSE data

- To download the data <https://github.com/girishg4t/bhavCopy-downloader>
- Downloaded data <https://github.com/girishg4t/nse-bse-bhavcopy/tree/master>

## Next up

- Backup Postgres data so that it can be recovered easily
- Adjust prices for splits/bonuses

## Backup/Restore data

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

- Step 1: Identify the split date and the split ratio. 1:1 split means the price
  is halved, so ratio is 2
- Step 2: Update the historical prices for the symbol 'RELIANCE' and round to 2
  decimal places

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
