import { useState, useEffect } from "react";
import axios from "axios";
import Plot from "react-plotly.js";
import { debounce } from "lodash";

type DataType = {
  date: string;
  close: number;
};

type SymbolType = {
  id: number;
  symbol: string;
};

const Dashboard = () => {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [data, setData] = useState<DataType[]>([]);
  const [symbols, setSymbols] = useState<SymbolType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<SymbolType[]>([]);

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
      const filteredSymbols = symbols.filter((s) =>
        s.symbol.toLowerCase().includes(term.toLowerCase())
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
          {suggestions.map((s) => (
            <li key={s.id} onClick={() => handleSymbolSelect(s.symbol)}>
              {s.symbol}
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
