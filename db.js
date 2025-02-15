const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { client } = require("./pg");
const { extractDateFromFileName } = require("./utils");

async function insertData(
  symbol,
  series,
  prevClose,
  open,
  high,
  low,
  close,
  date
) {
  try {
    const query = `
            INSERT INTO stock_data (symbol, series, prev_close, open, high, low, close, date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;
    const values = [symbol, series, prevClose, open, high, low, close, date];
    const res = await client.query(query, values);
  } catch (err) {
    if (err.code === "23505") {
      console.log(
        "Duplicate entry: Data already exists for the given symbol and date."
      );
    } else {
      console.error("Error inserting data:", err);
    }
  }
}

async function processCSV(filePath) {
  const date = extractDateFromFileName(filePath);
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", async (row) => {
        try {
          const trimmedRow = {};
          for (const key in row) {
            trimmedRow[key.trim()] = row[key].trim();
          }

          if (trimmedRow.SERIES === "EQ") {
            await insertData(
              trimmedRow.SYMBOL,
              trimmedRow.SERIES,
              parseFloat(trimmedRow.PREVCLOSE || trimmedRow.PREV_CLOSE),
              parseFloat(trimmedRow.OPEN || trimmedRow.OPEN_PRICE),
              parseFloat(trimmedRow.HIGH || trimmedRow.HIGH_PRICE),
              parseFloat(trimmedRow.LOW || trimmedRow.LOW_PRICE),
              parseFloat(trimmedRow.CLOSE || trimmedRow.CLOSE_PRICE),
              date
            );
          }
        } catch (err) {
          console.error("Error processing row:", row, err);
        }
      })
      .on("end", () => {
        console.log(`Finished processing ${filePath}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`Error processing CSV file: ${err}`);
        reject(err);
      });
  });
}

async function processCSVFiles(rootDir) {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    const years = ["2024"];
    for (const year of years) {
      const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN"];
      for (const month of months) {
        const files = fs.readdirSync(path.join(rootDir, year, month));
        for (const file of files) {
          if (file.endsWith(".csv")) {
            const filePath = path.join(rootDir, year, month, file);
            processCSV(filePath);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error connecting to PostgreSQL:", err);
  } finally {
    console.log("Disconnected from PostgreSQL");
  }
}

async function testOneCSVFile() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    const filePath = "./files/2025/FEB/13FEB2025.csv";
    await processCSV(filePath);
  } catch (err) {
    console.error("Error connecting to PostgreSQL:", err);
  } finally {
    setTimeout(() => {
      client.end();
    }, 3000);
    console.log("Disconnected from PostgreSQL");
  }
}

async function fetchRows() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");

    const result = await client.query("SELECT * FROM stock_data");
    console.log("Rows in the database:");
    console.table(result.rows);
  } catch (err) {
    console.error("Error fetching rows:", err);
  } finally {
    await client.end();
    console.log("Disconnected from PostgreSQL");
  }
}

module.exports = {
  processCSVFiles,
  testOneCSVFile,
  fetchRows,
  extractDateFromFileName,
};
