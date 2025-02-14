const { processCSVFiles, testOneCSVFile, fetchRows } = require("./db");
// Start processing
const rootDirectory = "path/to/your/csv/files"; // replace with the path to your CSV files

// processCSVFiles(rootDirectory).then(() => {
//   console.log("All CSV files processed");
// });

testOneCSVFile().then(() => {
  console.log("Single CSV file processed");
});

// fetchRows().then(() => {
//   console.log("All rows fetched");
// });
