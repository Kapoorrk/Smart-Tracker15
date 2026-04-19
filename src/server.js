require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = !process.env.DATABASE_URL;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── Mock DB for local development ───────────────────────────────────────────
let mockExpenses = [
  {
    id: 1,
    description: "Groceries",
    amount: 1500,
    category: "Food",
    expense_date: new Date().toISOString().split("T")[0],
    created_at: new Date(),
  },
  {
    id: 2,
    description: "Gas",
    amount: 2000,
    category: "Transport",
    expense_date: new Date().toISOString().split("T")[0],
    created_at: new Date(),
  },
];
let mockSettings = {};
let nextId = 3;

// ── DB Connection (Production) ──────────────────────────────────────────────
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

// ── Init DB ─────────────────────────────────────────────────────────────────
async function initDB() {
  if (isDev) {
    console.log("⚠️  Using in-memory database (local development mode)");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      category VARCHAR(50) NOT NULL DEFAULT 'Other',
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ DB tables ready");
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET all expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const { category, month } = req.query;

    if (isDev) {
      let filtered = [...mockExpenses];
      if (category && category !== "All") {
        filtered = filtered.filter((e) => e.category === category);
      }
      if (month) {
        filtered = filtered.filter((e) => e.expense_date.startsWith(month));
      }
      return res.json({
        success: true,
        data: filtered.sort(
          (a, b) => new Date(b.expense_date) - new Date(a.expense_date),
        ),
      });
    }

    let query = "SELECT * FROM expenses";
    const params = [];
    const conditions = [];

    if (category && category !== "All") {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (month) {
      params.push(month);
      conditions.push(`TO_CHAR(expense_date, 'YYYY-MM') = $${params.length}`);
    }
    if (conditions.length) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY expense_date DESC, created_at DESC";

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add expense
app.post("/api/expenses", async (req, res) => {
  try {
    const { description, amount, category, expense_date } = req.body;
    if (!description || !amount) {
      return res
        .status(400)
        .json({ success: false, error: "description and amount required" });
    }

    if (isDev) {
      const newExpense = {
        id: nextId++,
        description,
        amount: parseFloat(amount),
        category: category || "Other",
        expense_date: expense_date || new Date().toISOString().split("T")[0],
        created_at: new Date(),
      };
      mockExpenses.push(newExpense);
      return res.status(201).json({ success: true, data: newExpense });
    }

    const result = await pool.query(
      `INSERT INTO expenses (description, amount, category, expense_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        description,
        parseFloat(amount),
        category || "Other",
        expense_date || new Date().toISOString().split("T")[0],
      ],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE expense
app.delete("/api/expenses/:id", async (req, res) => {
  try {
    if (isDev) {
      mockExpenses = mockExpenses.filter(
        (e) => e.id !== parseInt(req.params.id),
      );
      return res.json({ success: true });
    }

    await pool.query("DELETE FROM expenses WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET summary stats
app.get("/api/expenses/summary", async (req, res) => {
  try {
    const { month } = req.query;
    const monthFilter = month || new Date().toISOString().slice(0, 7);

    if (isDev) {
      const filtered = mockExpenses.filter((e) =>
        e.expense_date.startsWith(monthFilter),
      );
      const total = filtered.reduce((sum, e) => sum + e.amount, 0);
      const byCategory = {};
      filtered.forEach((e) => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });
      const catBreakdown = Object.entries(byCategory).map(
        ([category, total]) => ({
          category,
          total: parseFloat(total),
          count: filtered.filter((e) => e.category === category).length,
        }),
      );
      const dailyTrend = {};
      filtered.forEach((e) => {
        const day = e.expense_date.split("-")[2];
        dailyTrend[day] = (dailyTrend[day] || 0) + e.amount;
      });
      const dailyTrendArray = Object.entries(dailyTrend).map(
        ([day, total]) => ({
          day,
          total: parseFloat(total),
        }),
      );
      return res.json({
        success: true,
        data: {
          total,
          count: filtered.length,
          byCategory: catBreakdown,
          dailyTrend: dailyTrendArray,
        },
      });
    }

    const [totals, catBreakdown, dailyTrend] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count
         FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1`,
        [monthFilter],
      ),
      pool.query(
        `SELECT category, COALESCE(SUM(amount),0) as total, COUNT(*) as count
         FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1
         GROUP BY category ORDER BY total DESC`,
        [monthFilter],
      ),
      pool.query(
        `SELECT TO_CHAR(expense_date,'DD') as day, SUM(amount) as total
         FROM expenses WHERE TO_CHAR(expense_date,'YYYY-MM') = $1
         GROUP BY day ORDER BY day`,
        [monthFilter],
      ),
    ]);

    res.json({
      success: true,
      data: {
        total: parseFloat(totals.rows[0].total),
        count: parseInt(totals.rows[0].count),
        byCategory: catBreakdown.rows,
        dailyTrend: dailyTrend.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET/SET budget setting
app.get("/api/settings/:key", async (req, res) => {
  try {
    if (isDev) {
      return res.json({
        success: true,
        value: mockSettings[req.params.key] || null,
      });
    }

    const result = await pool.query(
      "SELECT value FROM settings WHERE key = $1",
      [req.params.key],
    );
    res.json({ success: true, value: result.rows[0]?.value || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { key, value } = req.body;

    if (isDev) {
      mockSettings[key] = String(value);
      return res.json({ success: true });
    }

    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)],
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI Insights proxy (keeps API key server-side)
app.post("/api/ai/insights", async (req, res) => {
  try {
    const { summary, budget, total, count } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey)
      return res
        .status(500)
        .json({ success: false, error: "ANTHROPIC_API_KEY not set" });

    const prompt = `You are a friendly personal finance advisor for an Indian user. Analyze these monthly expenses and give brief actionable insights in 3-4 lines. Use ₹ for amounts.\n\nExpenses by category: ${summary}\nTotal spent: ₹${total}\nBudget: ${budget ? "₹" + budget : "not set"}\nTransactions: ${count}\n\nGive: 1) Spending pattern 2) One concern or highlight 3) One practical saving tip. Keep under 80 words and be warm and specific.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text =
      data.content?.find((b) => b.type === "text")?.text ||
      "Could not generate insights.";
    res.json({ success: true, insight: text });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all → serve index.html (SPA)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ── Start Server ────────────────────────────────────────────────────────────
(async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      const mode = isDev
        ? "development (mock database)"
        : "production (PostgreSQL)";
      console.log(`✅ Server running on http://localhost:${PORT} in ${mode}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
})();
