const { Client } = require("pg");

const client = new Client({
  user: "rakesharunachalam",
  host: "localhost",
  database: "stock_data",
  port: 5432,
});

module.exports = { client };
