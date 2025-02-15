## Deleted

```sql
delete from stock_splits where symbol like 'SIKKO' and split_date > '2025-01-30';
delete from stock_splits where symbol like 'NGLFINE' and split_date > '2025-01-30';
delete from stock_splits where symbol like 'AGIIL' and split_date > '2025-01-30';
delete from stock_splits where symbol like 'KSOLVES' and split_date > '2025-01-30';
delete from stock_splits where symbol like 'REDTAPE' and split_date > '2025-01-30';
delete from stock_splits where symbol like 'IGL' and split_date > '2025-01-05';
delete from stock_splits where symbol like 'JBMA' and split_date > '2025-01-05';
delete from stock_splits where symbol like 'SENCO' and split_date > '2025-01-05';
delete from stock_splits where symbol like 'CYIENT' and split_date > '2025-01-05';
delete from stock_splits where symbol like 'NAVA' and split_date > '2025-01-05';
delete from stock_splits where symbol like 'JAIBALAJI' and split_date > '2025-01-05';
```

## Correct mistaken edits

```sql
INSERT INTO stock_data
SELECT * FROM backup_stock_data where symbol like 'REDTAPE';
```

## Update prices

```sql
WITH split_info AS (
    SELECT
        '2025-01-30T00:00:00.000Z'::timestamp AS split_date,
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
    symbol = 'IGL'
    AND date <= split_info.split_date;
```

```sql
UPDATE stock_data
SET
    prev_close = ROUND(prev_close / 2, 2),
    open = ROUND(open / 2, 2),
    high = ROUND(high / 2, 2),
    low = ROUND(low / 2, 2),
    close = ROUND(close / 2, 2)
WHERE
    symbol = 'KSOLVES'
    AND date = '2025-02-05T00:00:00.000Z';
```
