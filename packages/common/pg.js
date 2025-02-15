const { Client, Pool } = require("pg");

const pgConnection = {
  user: "rakesharunachalam",
  host: "localhost",
  database: "stock_data",
  port: 5432,
};

const client = new Client(pgConnection);

const pool = new Pool(pgConnection);

module.exports = { client, pool };
