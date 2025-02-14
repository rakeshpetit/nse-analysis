const { Client } = require("pg");

const client = new Client({
  user: "db_user",
  password: "db_password",
  host: "localhost",
  database: "stock_data",
  port: 5432,
});

module.exports = { client };
