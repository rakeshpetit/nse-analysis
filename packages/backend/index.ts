import express from "express";
const { pool } = require("@nse-analysis/common/pg");

const app = express();

app.get("/prices/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const result = await pool.query(
    "SELECT * FROM stock_data WHERE symbol = $1 order by date",
    [symbol]
  );
  res.json(result.rows);
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
