require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = !process.env.MONGODB_URI;

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

// ── Mongoose Models (Production) ──────────────────────────────────────────────
// Define Schema for Expenses
const expenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  category: { type: String, default: 'Other' },
  expense_date: { type: String, default: () => new Date().toISOString().split("T")[0] },
  created_at: { type: Date, default: Date.now }
});
const Expense = mongoose.model('Expense', expenseSchema);

// Define Schema for Settings
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  updated_at: { type: Date, default: Date.now }
});
const Setting = mongoose.model('Setting', settingSchema);

// ── Init DB ─────────────────────────────────────────────────────────────────
async function initDB() {
  if (isDev) {
    console.log("⚠️  Using in-memory database (local development mode)");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
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

    const query = {};
    if (category && category !== "All") query.category = category;
    if (month) {
       // match strings starting with 'YYYY-MM'
       query.expense_date = { $regex: new RegExp("^" + month) };
    }

    const expenses = await Expense.find(query).sort({ expense_date: -1, created_at: -1 });
    
    // Map _id to id so frontend doesn't break
    const formattedExpenses = expenses.map(e => ({
      id: e._id,
      description: e.description,
      amount: e.amount,
      category: e.category,
      expense_date: e.expense_date,
      created_at: e.created_at
    }));

    res.json({ success: true, data: formattedExpenses });
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

    const newExpense = await Expense.create({
      description,
      amount: parseFloat(amount),
      category: category || "Other",
      expense_date: expense_date || new Date().toISOString().split("T")[0],
    });

    const formattedData = {
      id: newExpense._id,
      description: newExpense.description,
      amount: newExpense.amount,
      category: newExpense.category,
      expense_date: newExpense.expense_date,
      created_at: newExpense.created_at
    };

    res.status(201).json({ success: true, data: formattedData });
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
        (e) => String(e.id) !== String(req.params.id),
      );
      return res.json({ success: true });
    }

    await Expense.findByIdAndDelete(req.params.id);
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
          byCategory: catBreakdown.sort((a,b)=> b.total - a.total),
          dailyTrend: dailyTrendArray,
        },
      });
    }

    // MongoDB Aggregations
    const monthRegex = new RegExp("^" + monthFilter);

    // 1. Total and count
    const totalsAggr = await Expense.aggregate([
      { $match: { expense_date: monthRegex } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]);
    const totalData = totalsAggr[0] || { total: 0, count: 0 };

    // 2. Category Breakdown
    const catBreakdown = await Expense.aggregate([
      { $match: { expense_date: monthRegex } },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $project: { _id: 0, category: "$_id", total: 1, count: 1 } },
      { $sort: { total: -1 } }
    ]);

    // 3. Daily trend
    const dailyTrend = await Expense.aggregate([
      { $match: { expense_date: monthRegex } },
      { $addFields: { day: { $substr: ["$expense_date", 8, 2] } } }, // Extract DD from YYYY-MM-DD
      { $group: { _id: "$day", total: { $sum: "$amount" } } },
      { $project: { _id: 0, day: "$_id", total: 1 } },
      { $sort: { day: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        total: parseFloat(totalData.total) || 0,
        count: parseInt(totalData.count) || 0,
        byCategory: catBreakdown,
        dailyTrend: dailyTrend,
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

    const doc = await Setting.findOne({ key: req.params.key });
    res.json({ success: true, value: doc?.value || null });
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

    await Setting.findOneAndUpdate(
      { key },
      { value: String(value), updated_at: Date.now() },
      { upsert: true, new: true }
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
        : "production (MongoDB)";
      console.log(`✅ Server running on http://localhost:${PORT} in ${mode}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
})();
