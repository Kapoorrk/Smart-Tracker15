# Smart Expense Tracker

AI-powered expense tracker with PostgreSQL cloud database, Express backend, and Claude AI insights — deployable on Render in minutes.

## Stack

| Layer      | Tech                        |
|------------|-----------------------------|
| Frontend   | Vanilla HTML/CSS/JS         |
| Backend    | Node.js + Express           |
| Database   | PostgreSQL (Render managed) |
| AI         | Claude (Anthropic API)      |
| Hosting    | Render.com                  |

## Features

- Add, view, delete expenses with categories and dates
- Monthly budget tracker with visual progress bar
- Category breakdown chart
- Month-by-month filtering
- AI-powered financial insights (3 modes: general, savings, red flags)
- All data stored in cloud PostgreSQL — persists across sessions and devices

## Deploy to Render (5 minutes)

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/smart-expense-tracker.git
git push -u origin main
```

### Step 2 — Deploy on Render

1. Go to [render.com](https://render.com) and sign in
2. Click **New → Blueprint**
3. Connect your GitHub repo
4. Render reads `render.yaml` and auto-creates:
   - A **Web Service** (Node.js)
   - A **PostgreSQL database** (free tier)
5. After deploy, go to your service → **Environment** tab
6. Add the environment variable:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from [console.anthropic.com](https://console.anthropic.com)
7. Click **Save** — Render redeploys automatically

### Step 3 — Done!

Your app is live at `https://smart-expense-tracker.onrender.com` (or similar).

## Run Locally

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your DATABASE_URL and ANTHROPIC_API_KEY

# Start server
npm run dev   # with nodemon (auto-restart)
# or
npm start
```

App runs at `http://localhost:3000`

## API Endpoints

| Method | Endpoint                    | Description               |
|--------|-----------------------------|---------------------------|
| GET    | /api/expenses               | List expenses (filter by category/month) |
| POST   | /api/expenses               | Add new expense           |
| DELETE | /api/expenses/:id           | Delete expense            |
| GET    | /api/expenses/summary       | Stats + category breakdown|
| GET    | /api/settings/:key          | Get a setting (e.g. budget)|
| POST   | /api/settings               | Save a setting            |
| POST   | /api/ai/insights            | Get AI financial insight  |

## Database Schema

```sql
-- expenses table
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(50) DEFAULT 'Other',
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- settings table (budget etc.)
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Tables are auto-created on first server start (`initDB()`).
