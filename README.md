# NSE data Analysis

## Repos that can help with NSE/BSE data

- To download the data <https://github.com/girishg4t/bhavCopy-downloader>
- Downloaded data <https://github.com/girishg4t/nse-bse-bhavcopy/tree/master>

## Next up

- Backup Postgres data so that it can be recovered easily
- Adjust prices for splits/bonuses

## Backing up data

```sql
CREATE TABLE backup_stock_data AS
SELECT * FROM stock_data
WHERE 1=0;

INSERT INTO backup_stock_data
SELECT * FROM stock_data;
```
