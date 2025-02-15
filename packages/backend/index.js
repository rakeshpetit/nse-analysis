import express from "express";
import { Pool } from "pg";

const app = express();
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "stock_data",
  password: "password",
  port: 5432,
});

app.get("/prices/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const result = await pool.query("SELECT * FROM prices WHERE symbol = $1", [
    symbol,
  ]);
  res.json(result.rows);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
