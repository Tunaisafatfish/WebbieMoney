import json
import os
import sqlite3
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')
DB_PATH = os.path.join(os.path.dirname(__file__), 'finance.db')

DEFAULT_STATE = {
    'accounts': [],
    'expenseCategories': [],
    'incomeCategories': [],
    'investmentAccounts': [],
    'investmentRecords': [],
    'investmentReturns': [],
    'monthlyExpenseRecords': [],
    'monthlyIncomeRecords': [],
    'fixedRules': [],
}

LEGACY_DEMO_ACCOUNT_NAMES = {
    'BOA Income Deposite',
    'BOA Rent and Utility',
    'BOA Savings',
    'Chase Checking',
    'Chase Saving',
    'Chase Freedom Flex',
    'BOA Credit Card',
}

LEGACY_DEMO_CATEGORY_NAMES = {
    'Housing',
    'Groceries',
    'Dining',
    'Coffee',
    'Transportation',
    'Utilities',
    'Entertainment',
    'Health',
    'Shopping',
    'Travel',
    'Subscription',
    'Salary',
    'Freelance',
    'Bonus',
}

LEGACY_DEMO_INVESTMENT_NAMES = {'Brokerage', 'ETF Portfolio', 'Retirement', 'QQQ', 'VTI'}


def is_legacy_demo_state(payload):
    if not isinstance(payload, dict):
        return False

    account_names = {
        item.get('name', '')
        for item in payload.get('accounts', [])
        if isinstance(item, dict) and isinstance(item.get('name'), str)
    }
    expense_names = set(payload.get('expenseCategories', []) or [])
    income_names = set(payload.get('incomeCategories', []) or [])
    investment_names = set(payload.get('investmentAccounts', []) or [])
    stock_names = {
        item.get('stock', '')
        for item in payload.get('investmentRecords', [])
        if isinstance(item, dict)
    }
    return (
        bool(account_names & LEGACY_DEMO_ACCOUNT_NAMES)
        or (bool(expense_names & LEGACY_DEMO_CATEGORY_NAMES) and bool(income_names & LEGACY_DEMO_CATEGORY_NAMES))
        or (bool(investment_names & LEGACY_DEMO_INVESTMENT_NAMES) and bool(stock_names & {'QQQ', 'VTI'}))
    )


def sanitize_state(payload):
    if not isinstance(payload, dict):
        return DEFAULT_STATE.copy()
    cleaned = payload.copy()
    if is_legacy_demo_state(cleaned):
        return DEFAULT_STATE.copy()
    return cleaned


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    conn.execute('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)')
    row = conn.execute('SELECT data FROM app_state WHERE id = 1').fetchone()
    if row is None:
        conn.execute('INSERT INTO app_state (id, data) VALUES (1, ?)', (json.dumps(DEFAULT_STATE),))
    else:
        current = json.loads(row['data'])
        if is_legacy_demo_state(current):
            conn.execute('UPDATE app_state SET data = ? WHERE id = 1', (json.dumps(DEFAULT_STATE),))
    conn.commit()
    conn.close()


@app.get('/api/health')
def health():
    return jsonify({'ok': True, 'status': 'running'})


@app.get('/api/state')
def get_state():
    conn = get_db_connection()
    row = conn.execute('SELECT data FROM app_state WHERE id = 1').fetchone()
    conn.close()
    if row is None:
        return jsonify(DEFAULT_STATE)
    state = sanitize_state(json.loads(row['data']))
    return jsonify(state)


@app.post('/api/state')
def save_state():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({'error': 'State payload is required'}), 400

    sanitized = sanitize_state(payload)
    conn = get_db_connection()
    conn.execute(
        'INSERT INTO app_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
        (json.dumps(sanitized),),
    )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory('.', path if path else 'index.html')


init_db()


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=False)
