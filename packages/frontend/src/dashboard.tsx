import { useState, useEffect } from "react";
import axios from "axios";
import Plot from "react-plotly.js";
import { debounce } from "lodash";

type DataType = {
  date: string;
  close: number;
};

const Dashboard = () => {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [data, setData] = useState<DataType[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    axios
      .get("http://localhost:3000/symbols")
      .then((response) => setSymbols(response.data))
      .catch((error) => console.error(error));
  }, []);

  useEffect(() => {
    axios
      .get(`http://localhost:3000/prices/${symbol}`)
      .then((response) => setData(response.data))
      .catch((error) => console.error(error));
  }, [symbol]);

  const handleSearch = debounce((term: string) => {
    if (term.length > 0) {
      const filteredSymbols = symbols.filter((symbol) =>
        symbol.toLowerCase().includes(term.toLowerCase())
      );
      setSuggestions(filteredSymbols);
    } else {
      setSuggestions([]);
    }
  }, 300);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    handleSearch(term);
  };

  const handleSymbolSelect = (selectedSymbol: string) => {
    setSymbol(selectedSymbol);
    setSearchTerm("");
    setSuggestions([]);
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Search for a symbol..."
        value={searchTerm}
        onChange={handleInputChange}
      />
      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((symbol) => (
            <li key={symbol} onClick={() => handleSymbolSelect(symbol)}>
              {symbol}
            </li>
          ))}
        </ul>
      )}
      <Plot
        data={[
          {
            x: data.map((row) => row.date),
            y: data.map((row) => row.close),
            type: "scatter",
            mode: "lines",
          },
        ]}
        layout={{ width: 1200, height: 800, title: `${symbol} Price Chart` }}
      />
    </div>
  );
};

export default Dashboard;
