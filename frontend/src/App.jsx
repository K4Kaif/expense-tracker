import { useEffect, useState } from "react";
import "./App.css";

const CATEGORIES = ["Food", "Travel", "Bills", "Shopping", "Health", "Other"];
const today = () => new Date().toLocaleDateString("en-CA");
const money = (n) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);

function App() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ total: 0, by_category: [] });
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "Food",
    spent_on: today(),
  });
  const [error, setError] = useState("");

  async function loadData() {
    try {
      const [listRes, sumRes] = await Promise.all([
        fetch("/api/expenses"),
        fetch("/api/summary"),
      ]);
      if (!listRes.ok || !sumRes.ok) throw new Error("Server error");
      setExpenses(await listRes.json());
      setSummary(await sumRes.json());
      setError("");
    } catch {
      setError("Could not reach the API. Is the server running?");
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function addExpense(e) {
    e.preventDefault();
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      if (!res.ok) throw new Error("Bad request");
      setForm({ ...form, title: "", amount: "" });
      loadData();
    } catch {
      setError("Could not save the expense. Please check the values.");
    }
  }

  async function deleteExpense(id) {
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      loadData();
    } catch {
      setError("Could not delete the expense.");
    }
  }

  const max = Math.max(1, ...summary.by_category.map((c) => c.total));

  return (
    <div className="app">
      <h1>Expense Tracker</h1>

      {error && <div className="error">{error}</div>}

      <div className="total-card">
        <span>Total spent</span>
        <strong>{money(summary.total)}</strong>
      </div>

      <form className="card form" onSubmit={addExpense}>
        <input
          placeholder="What did you spend on?"
          value={form.title}
          onChange={update("title")}
          maxLength={100}
          required
        />
        <input
          type="number"
          placeholder="Amount"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={update("amount")}
          required
        />
        <select value={form.category} onChange={update("category")}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" value={form.spent_on} onChange={update("spent_on")} required />
        <button type="submit">Add expense</button>
      </form>

      <div className="columns">
        <div className="card">
          <h2>Recent expenses</h2>
          {expenses.length === 0 && (
            <p className="muted">No expenses yet. Add your first one above.</p>
          )}
          <ul className="list">
            {expenses.map((x) => (
              <li className="item" key={x.id}>
                <div>
                  <div className="title">{x.title}</div>
                  <div className="meta">
                    {x.category} · {x.spent_on}
                  </div>
                </div>
                <div className="right">
                  <strong>{money(x.amount)}</strong>
                  <button className="delete" onClick={() => deleteExpense(x.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>By category</h2>
          {summary.by_category.length === 0 && <p className="muted">Nothing to show yet.</p>}
          {summary.by_category.map((c) => (
            <div className="bar-row" key={c.category}>
              <div className="bar-label">
                <span>{c.category}</span>
                <span>{money(c.total)}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(c.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
