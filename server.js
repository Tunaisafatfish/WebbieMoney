const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = process.env.PORT || 3000;
const dbFile = path.join(__dirname, 'finance.db');
const db = new sqlite3.Database(dbFile);

const defaultState = {
  accounts: [
    { name: 'BOA Income Deposite', type: 'checking', balance: 4200 },
    { name: 'BOA Rent and Utility', type: 'checking', balance: 3400 },
    { name: 'BOA Savings', type: 'savings', balance: 9000 },
    { name: 'Chase Checking', type: 'checking', balance: 2800 },
    { name: 'Chase Saving', type: 'savings', balance: 12000 },
    { name: 'Chase Freedom Flex', type: 'credit_card', balance: 320 },
    { name: 'BOA Credit Card', type: 'credit_card', balance: 540 },
  ],
  expenseCategories: ['Housing', 'Groceries', 'Dining', 'Coffee', 'Transportation', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Travel', 'Subscription'],
  incomeCategories: ['Salary', 'Freelance', 'Bonus'],
  investmentAccounts: ['Brokerage', 'ETF Portfolio', 'Retirement'],
  investmentRecords: [],
  investmentReturns: [],
  monthlyExpenseRecords: [],
  monthlyIncomeRecords: [],
  fixedRules: [],
};

function ensureSchema() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    )`);

    db.get('SELECT data FROM app_state WHERE id = 1', (err, row) => {
      if (err) {
        console.error('Database read failed:', err.message);
        return;
      }

      if (!row) {
        db.run('INSERT INTO app_state (id, data) VALUES (1, ?)', [JSON.stringify(defaultState)]);
      }
    });
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'running' });
});

app.get('/api/state', (req, res) => {
  db.get('SELECT data FROM app_state WHERE id = 1', (err, row) => {
    if (err) {
      console.error('Get state failed:', err.message);
      return res.status(500).json({ error: 'Database read failed' });
    }

    const parsed = row && row.data ? JSON.parse(row.data) : defaultState;
    return res.json(parsed);
  });
});

app.post('/api/state', (req, res) => {
  const payload = req.body;

  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'State payload is required' });
  }

  db.run(
    'INSERT INTO app_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
    [JSON.stringify(payload)],
    function onSave(err) {
      if (err) {
        console.error('Save state failed:', err.message);
        return res.status(500).json({ error: 'Database write failed' });
      }

      return res.json({ ok: true, updated: this.changes > 0 });
    }
  );
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

ensureSchema();

app.listen(port, () => {
  console.log(`Finance app listening on http://localhost:${port}`);
});
