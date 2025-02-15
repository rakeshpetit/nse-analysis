const { processCSVFiles, testOneCSVFile, fetchRows } = require("./db");

const rootDirectory = "./files";

// processCSVFiles(rootDirectory).then(() => {
//   console.log("All CSV files processed");
// });

fetchRows().then(() => {
  console.log("All rows fetched");
});
