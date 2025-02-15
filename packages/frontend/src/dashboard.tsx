import { useState, useEffect } from "react";
import axios from "axios";
import Plot from "react-plotly.js";

type DataType = {
  date: string;
  close: number;
};

const Dashboard = () => {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [data, setData] = useState<DataType[]>([]);

  useEffect(() => {
    axios
      .get(`http://localhost:3000/prices/${symbol}`)
      .then((response) => setData(response.data))
      .catch((error) => console.error(error));
  }, [symbol]);

  return (
    <div>
      <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
        <option value="SHRIRAMFIN">SHRIRAMFIN</option>
        <option value="RELIANCE">RELIANCE</option>
      </select>
      <Plot
        data={[
          {
            x: data.map((row) => row.date),
            y: data.map((row) => row.close),
            type: "scatter",
            mode: "lines",
          },
        ]}
        layout={{ width: 1440, height: 880, title: `${symbol} Price Chart` }}
      />
    </div>
  );
};

export default Dashboard;
