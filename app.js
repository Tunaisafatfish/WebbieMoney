const STORAGE_KEY = 'personal-finance-manager-v2';

const defaultAccounts = [];
const defaultExpenseCategories = [];
const defaultIncomeCategories = [];
const defaultInvestmentAccounts = [];
const defaultFixedRules = [];

function createDefaultState() {
  return {
    accounts: [...defaultAccounts],
    expenseCategories: [...defaultExpenseCategories],
    incomeCategories: [...defaultIncomeCategories],
    investmentAccounts: [...defaultInvestmentAccounts],
    investmentRecords: [],
    investmentReturns: [],
    monthlyExpenseRecords: [],
    monthlyIncomeRecords: [],
    fixedRules: [],
    archivedMonthData: {},
    lastArchivedMonth: '',
  };
}

let state = createDefaultState();
let pendingAccountDeleteName = null;
let pendingExpenseDeleteId = null;
let pendingRecurringDeleteId = null;
let pendingIncomeDeleteId = null;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeState(rawState) {
  const defaults = createDefaultState();
  const next = rawState && typeof rawState === 'object' ? rawState : {};

  return {
    ...defaults,
    ...next,
    accounts: Array.isArray(next.accounts) ? next.accounts : defaults.accounts,
    expenseCategories: Array.isArray(next.expenseCategories) ? next.expenseCategories : defaults.expenseCategories,
    incomeCategories: Array.isArray(next.incomeCategories) ? next.incomeCategories : defaults.incomeCategories,
    investmentAccounts: Array.isArray(next.investmentAccounts) ? next.investmentAccounts : defaults.investmentAccounts,
    investmentRecords: Array.isArray(next.investmentRecords) ? next.investmentRecords : defaults.investmentRecords,
    investmentReturns: Array.isArray(next.investmentReturns) ? next.investmentReturns : defaults.investmentReturns,
    monthlyExpenseRecords: Array.isArray(next.monthlyExpenseRecords) ? next.monthlyExpenseRecords : defaults.monthlyExpenseRecords,
    monthlyIncomeRecords: Array.isArray(next.monthlyIncomeRecords) ? next.monthlyIncomeRecords : defaults.monthlyIncomeRecords,
    fixedRules: Array.isArray(next.fixedRules) ? next.fixedRules : defaults.fixedRules,
    archivedMonthData: next.archivedMonthData && typeof next.archivedMonthData === 'object' ? next.archivedMonthData : defaults.archivedMonthData,
    lastArchivedMonth: typeof next.lastArchivedMonth === 'string' ? next.lastArchivedMonth : defaults.lastArchivedMonth,
  };
}

function getPreviousMonthKey(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return '';

  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getAllExpenseRecords() {
  return [
    ...state.monthlyExpenseRecords,
    ...Object.values(state.archivedMonthData || {}).flatMap((entry) => entry.monthlyExpenseRecords || []),
  ];
}

function getAllIncomeRecords() {
  return [
    ...state.monthlyIncomeRecords,
    ...Object.values(state.archivedMonthData || {}).flatMap((entry) => entry.monthlyIncomeRecords || []),
  ];
}

function getExpenseRecordsForMonth(monthKey) {
  const active = state.monthlyExpenseRecords.filter((record) => record.month === monthKey);
  const archived = state.archivedMonthData?.[monthKey]?.monthlyExpenseRecords || [];
  return [...active, ...archived];
}

function getIncomeRecordsForMonth(monthKey) {
  const active = state.monthlyIncomeRecords.filter((record) => record.month === monthKey);
  const archived = state.archivedMonthData?.[monthKey]?.monthlyIncomeRecords || [];
  return [...active, ...archived];
}

function archivePreviousMonthData() {
  const currentMonth = currentMonthKey();
  if (!currentMonth) return;

  if (!state.lastArchivedMonth) {
    state.lastArchivedMonth = currentMonth;
    return;
  }

  const targetMonth = getPreviousMonthKey(currentMonth);
  if (!targetMonth || targetMonth === state.lastArchivedMonth) return;

  let cursor = targetMonth;

  while (cursor && cursor !== state.lastArchivedMonth) {
    const archivedExpense = state.monthlyExpenseRecords.filter((record) => record.month === cursor);
    const archivedIncome = state.monthlyIncomeRecords.filter((record) => record.month === cursor);

    if (archivedExpense.length || archivedIncome.length) {
      state.archivedMonthData[cursor] = {
        monthlyExpenseRecords: archivedExpense,
        monthlyIncomeRecords: archivedIncome,
      };
    }

    state.monthlyExpenseRecords = state.monthlyExpenseRecords.filter((record) => record.month !== cursor);
    state.monthlyIncomeRecords = state.monthlyIncomeRecords.filter((record) => record.month !== cursor);
    cursor = getPreviousMonthKey(cursor);
  }

  state.lastArchivedMonth = currentMonth;
}

async function loadState() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (response.ok) {
      const parsed = await response.json();
      return normalizeState(parsed);
    }
  } catch (error) {
    console.warn('Falling back to localStorage for state:', error);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createDefaultState();

  try {
    return normalizeState(JSON.parse(saved));
  } catch (error) {
    return createDefaultState();
  }
}

async function saveState() {
  const payload = JSON.stringify(state);

  try {
    const response = await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    if (response.ok) {
      localStorage.setItem(STORAGE_KEY, payload);
      return;
    }
  } catch (error) {
    console.warn('Server save failed, using localStorage fallback:', error);
  }

  localStorage.setItem(STORAGE_KEY, payload);
}

function money(value) {
  return currencyFormatter.format(Number(value || 0));
}

function getAccountByName(accountName, targetState = state) {
  const normalized = String(accountName || '').trim();
  return targetState.accounts.find((account) => account.name.toLowerCase() === normalized.toLowerCase());
}

function openAccountDeleteModal(accountName) {
  pendingAccountDeleteName = accountName;
  const modal = document.getElementById('account-delete-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeAccountDeleteModal() {
  pendingAccountDeleteName = null;
  const modal = document.getElementById('account-delete-modal');
  if (modal) modal.classList.add('hidden');
}

function openExpenseDeleteModal(recordId) {
  pendingExpenseDeleteId = recordId;
  const modal = document.getElementById('expense-delete-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeExpenseDeleteModal() {
  pendingExpenseDeleteId = null;
  const modal = document.getElementById('expense-delete-modal');
  if (modal) modal.classList.add('hidden');
}

function openRecurringDeleteModal(ruleId) {
  pendingRecurringDeleteId = ruleId;
  const modal = document.getElementById('recurring-delete-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeRecurringDeleteModal() {
  pendingRecurringDeleteId = null;
  const modal = document.getElementById('recurring-delete-modal');
  if (modal) modal.classList.add('hidden');
}

function openIncomeDeleteModal(recordId) {
  pendingIncomeDeleteId = recordId;
  const modal = document.getElementById('income-delete-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeIncomeDeleteModal() {
  pendingIncomeDeleteId = null;
  const modal = document.getElementById('income-delete-modal');
  if (modal) modal.classList.add('hidden');
}

function deleteAccountByName(accountName, targetState = state) {
  const sanitizedName = String(accountName || '').trim();
  if (!sanitizedName) return targetState;

  targetState.accounts = targetState.accounts.filter((account) => account.name !== sanitizedName);
  targetState.monthlyExpenseRecords = targetState.monthlyExpenseRecords.map((record) => (
    record.account === sanitizedName ? { ...record, account: 'Deleted account' } : record
  ));
  targetState.monthlyIncomeRecords = targetState.monthlyIncomeRecords.map((record) => (
    record.account === sanitizedName ? { ...record, account: 'Deleted account' } : record
  ));
  targetState.investmentRecords = targetState.investmentRecords.map((record) => (
    record.account === sanitizedName ? { ...record, account: 'Deleted account' } : record
  ));
  targetState.investmentReturns = targetState.investmentReturns.map((record) => (
    record.account === sanitizedName ? { ...record, account: 'Deleted account' } : record
  ));
  return targetState;
}

function deleteExpenseRecord(recordId, targetState = state) {
  const index = targetState.monthlyExpenseRecords.findIndex((record) => record.id === recordId);
  if (index === -1) return targetState;

  const [removedRecord] = targetState.monthlyExpenseRecords.splice(index, 1);
  if (removedRecord && removedRecord.account) {
    const account = getAccountByName(removedRecord.account, targetState);
    if (account) {
      const restoreDelta = account.type === 'credit_card'
        ? -Number(removedRecord.amount || 0)
        : Number(removedRecord.amount || 0);
      account.balance = Number(account.balance || 0) + restoreDelta;
    }
  }

  return targetState;
}

function deleteRecurringRule(ruleId, targetState = state) {
  targetState.fixedRules = targetState.fixedRules.filter((rule) => rule.id !== ruleId);
  return targetState;
}

function deleteIncomeRecord(recordId, targetState = state) {
  const index = targetState.monthlyIncomeRecords.findIndex((record) => record.id === recordId);
  if (index === -1) return targetState;

  const [removedRecord] = targetState.monthlyIncomeRecords.splice(index, 1);
  if (removedRecord && removedRecord.account) {
    const account = getAccountByName(removedRecord.account, targetState);
    if (account) {
      account.balance = Number(account.balance || 0) - Number(removedRecord.amount || 0);
    }
  }

  return targetState;
}

function setDefaultMonthInputs() {
  const month = currentMonthKey();
  const monthElements = ['report-month', 'monthly-income-month'];
  monthElements.forEach((id) => {
    const element = document.getElementById(id);
    if (element) element.value = month;
  });
}

function monthLabel(monthValue) {
  if (!monthValue) return 'Current month';
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function getWeeksInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.max(4, Math.round((daysInMonth / 7) * 10) / 10);
}

function getFixedMonthlyAmount(rule, monthKey) {
  if (!rule || !monthKey) return 0;
  if (rule.cycle === 'weekly') return Number(rule.amount || 0) * getWeeksInMonth(monthKey);
  if (rule.cycle === 'yearly') return Number(rule.amount || 0) / 12;
  return Number(rule.amount || 0);
}

function getMonthExpenseTotal(monthKey) {
  const manual = getExpenseRecordsForMonth(monthKey)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const investment = state.investmentRecords
    .filter((item) => item.date && item.date.slice(0, 7) === monthKey)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const fixed = state.fixedRules.reduce((sum, rule) => sum + getFixedMonthlyAmount(rule, monthKey), 0);
  return manual + fixed + investment;
}

function getMonthIncomeTotal(monthKey) {
  return getIncomeRecordsForMonth(monthKey)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function buildDonutMarkup(entries, total, colors) {
  const safeTotal = total || 1;
  let start = 0;
  const segments = entries.map((entry, index) => {
    const angle = (entry.amount / safeTotal) * 360;
    const color = colors[index % colors.length];
    const segment = `${color} ${start}deg ${start + angle}deg`;
    start += angle;
    return segment;
  });

  const donutStyle = `background: conic-gradient(${segments.join(', ')});`;
  return `
    <div class="breakdown-shell">
      <div class="donut-chart" style="${donutStyle}">
        <div class="donut-center">
          <strong>${money(total)}</strong>
          <span>Total</span>
        </div>
      </div>
      <div class="breakdown-list">
        ${entries.map((entry, index) => `
          <div class="breakdown-item">
            <div class="breakdown-meta">
              <span>${entry.category}</span>
              <strong>${money(entry.amount)} (${entry.pct.toFixed(1)}%)</strong>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(entry.pct, 100)}%; background: linear-gradient(90deg, ${colors[index % colors.length]} 0%, ${colors[(index + 1) % colors.length]} 100%);"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderFixedSpendingSummary() {
  const container = document.getElementById('fixed-spending-summary');
  if (!container) return;

  const month = currentMonthKey();
  const summaryByCategory = getMonthExpenseBreakdown(month);
  const recurringEntries = state.fixedRules.map((rule) => ({
    category: rule.category,
    name: rule.name,
    amount: getFixedMonthlyAmount(rule, month),
    cycle: rule.cycle,
  }));

  const total = Object.values(summaryByCategory).reduce((sum, value) => sum + Number(value || 0), 0);

  if (!Object.keys(summaryByCategory).length && !recurringEntries.length) {
    container.innerHTML = '<p class="muted">No expenses configured yet.</p>';
    return;
  }

  const chartEntries = Object.entries(summaryByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount: Number(amount || 0), pct: total ? (Number(amount || 0) / total) * 100 : 0 }));

  const colors = ['#c7bddb', '#d7a9a1', '#b9c8d8', '#e7c7a3', '#8bb89f', '#c9d8c7'];
  container.innerHTML = `
    <div style="margin-bottom: 16px;">${buildDonutMarkup(chartEntries, total, colors)}</div>
    <div class="record-list">
      ${recurringEntries.map((entry) => `
        <div class="record-item">
          <div>
            <strong>${entry.name}</strong><br />
            <small>${entry.category} · ${entry.cycle}</small>
          </div>
          <span class="amount-text amount-negative">${money(entry.amount)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDailyExpenseSummary() {
  const container = document.getElementById('daily-expense-summary');
  if (!container) return;

  const month = currentMonthKey();
  const dailyRecords = getExpenseRecordsForMonth(month).filter((record) => record.date);
  const summaryByCategory = aggregateByCategory(dailyRecords);
  const total = Object.values(summaryByCategory).reduce((sum, value) => sum + Number(value || 0), 0);

  if (!Object.keys(summaryByCategory).length) {
    container.innerHTML = '<p class="muted">No daily expenses recorded yet.</p>';
    return;
  }

  const chartEntries = Object.entries(summaryByCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount: Number(amount || 0), pct: total ? (Number(amount || 0) / total) * 100 : 0 }));

  const colors = ['#d7a9a1', '#b9c8d8', '#e7c7a3', '#8bb89f', '#c9d8c7', '#c7bddb'];
  container.innerHTML = buildDonutMarkup(chartEntries, total, colors);
}

function renderRecurringSpendingList() {
  const container = document.getElementById('recurring-spending-list');
  const totalElement = document.getElementById('recurring-spending-total');
  if (!container) return;

  const month = currentMonthKey();
  const recurringRules = state.fixedRules.map((rule) => ({
    ...rule,
    monthlyAmount: getFixedMonthlyAmount(rule, month),
  }));

  const total = recurringRules.reduce((sum, rule) => sum + Number(rule.monthlyAmount || 0), 0);
  if (totalElement) totalElement.textContent = money(total);

  if (!recurringRules.length) {
    container.innerHTML = '<p class="muted">No recurring spending added yet.</p>';
    return;
  }

  container.innerHTML = recurringRules.map((rule) => `
    <div class="record-item">
      <div>
        <strong>${rule.name}</strong><br />
        <small>${rule.category} · ${rule.cycle}</small>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="amount-text amount-negative">${money(rule.monthlyAmount)}</span>
        <button type="button" class="delete-x" data-delete-recurring-rule="${rule.id}" aria-label="Delete ${rule.name}">×</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-recurring-rule]').forEach((button) => {
    button.addEventListener('click', () => {
      openRecurringDeleteModal(button.dataset.deleteRecurringRule);
    });
  });
}

function renderExpenseEntries() {
  const container = document.getElementById('expense-entry-list');
  if (!container) return;

  const month = currentMonthKey();
  const records = getExpenseRecordsForMonth(month).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!records.length) {
    container.innerHTML = '<p class="muted">No expense entries recorded yet.</p>';
    return;
  }

  container.innerHTML = records.map((record) => `
    <div class="record-item">
      <div>
        <strong>${record.category}</strong><br />
        <small>${record.date || '—'} · ${record.account || '—'}${record.note ? ` · ${record.note}` : ''}</small>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="amount-text amount-negative">${money(record.amount)}</span>
        <button type="button" class="delete-x" data-delete-expense-record="${record.id}" aria-label="Delete expense ${record.category}">×</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-expense-record]').forEach((button) => {
    button.addEventListener('click', () => {
      openExpenseDeleteModal(button.dataset.deleteExpenseRecord);
    });
  });
}

function renderIncomeEntries() {
  const container = document.getElementById('income-entry-list');
  if (!container) return;

  const month = currentMonthKey();
  const records = getIncomeRecordsForMonth(month).sort((a, b) => (b.month || '').localeCompare(a.month || ''));

  if (!records.length) {
    container.innerHTML = '<p class="muted">No income entries recorded yet.</p>';
    return;
  }

  container.innerHTML = records.map((record) => `
    <div class="record-item">
      <div>
        <strong>${record.category}</strong><br />
        <small>${record.month || '—'} · ${record.account || '—'}${record.note ? ` · ${record.note}` : ''}</small>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="amount-text amount-positive">${money(record.amount)}</span>
        <button type="button" class="delete-x" data-delete-income-record="${record.id}" aria-label="Delete income ${record.category}">×</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-income-record]').forEach((button) => {
    button.addEventListener('click', () => {
      openIncomeDeleteModal(button.dataset.deleteIncomeRecord);
    });
  });
}

function renderAccounts() {
  const container = document.getElementById('account-list');

  if (!state.accounts.length) {
    container.innerHTML = '<p class="muted">No bank accounts added yet. Create one to begin.</p>';
    return;
  }

  container.innerHTML = state.accounts.map((account) => `
    <div class="account-item">
      <header>
        <strong>${account.name}</strong>
        <small>${account.type}</small>
      </header>
      <div class="account-item-actions">
        <label>
          <span>Current balance</span>
          <input type="number" min="0" step="0.01" value="${Number(account.balance || 0).toFixed(2)}" data-account-name="${account.name}" />
        </label>
        <button type="button" class="delete-x" data-delete-account="${account.name}" aria-label="Delete ${account.name}">×</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('#account-list input[data-account-name]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const name = event.target.dataset.accountName;
      const account = state.accounts.find((item) => item.name === name);
      if (account) {
        account.balance = Number(event.target.value || 0);
        saveState();
        renderReports();
      }
    });
  });

  document.querySelectorAll('[data-delete-account]').forEach((button) => {
    button.addEventListener('click', () => {
      openAccountDeleteModal(button.dataset.deleteAccount);
    });
  });
}

function renderIncomeBreakdownChart() {
  const container = document.getElementById('income-breakdown-chart');
  if (!container) return;

  const currentMonth = currentMonthKey();
  const breakdown = getMonthIncomeBreakdown(currentMonth);
  const total = Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0);

  const entries = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount, pct: total ? (amount / total) * 100 : 0 }));

  if (!entries.length) {
    container.innerHTML = '<p class="muted">No income data yet for this month.</p>';
    return;
  }

  container.innerHTML = buildDonutMarkup(entries, total, ['#8bb89f', '#d7a9a1', '#e7c7a3', '#b1cfe0', '#c9d8c7', '#c7bddb']);
}

function renderExpenseCategoryList() {
  const container = document.getElementById('expense-category-list');
  container.innerHTML = state.expenseCategories.map((category) => `
    <span class="tag">
      ${category}
      <button data-delete-category="${category}" data-kind="expense" aria-label="Delete ${category}">×</button>
    </span>
  `).join('');

  document.querySelectorAll('[data-delete-category][data-kind="expense"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.deleteCategory;
      state.expenseCategories = state.expenseCategories.filter((item) => item !== category);
      saveState();
      renderAll();
    });
  });
}

function renderIncomeCategoryList() {
  const container = document.getElementById('income-category-list');
  container.innerHTML = state.incomeCategories.map((category) => `
    <span class="tag">
      ${category}
      <button data-delete-category="${category}" data-kind="income" aria-label="Delete ${category}">×</button>
    </span>
  `).join('');

  document.querySelectorAll('[data-delete-category][data-kind="income"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.deleteCategory;
      state.incomeCategories = state.incomeCategories.filter((item) => item !== category);
      saveState();
      renderAll();
    });
  });
}

function updateSelects() {
  const expenseSelect = document.getElementById('fixed-rule-category');
  const dailyExpenseCategory = document.getElementById('daily-expense-category');
  const monthlyIncomeCategory = document.getElementById('monthly-income-category');
  const dailyExpenseAccount = document.getElementById('daily-expense-account');
  const investmentAccount = document.getElementById('investment-account');
  const investmentReturnAccount = document.getElementById('investment-return-account');
  const monthlyIncomeAccount = document.getElementById('monthly-income-account');

  if (expenseSelect) {
    expenseSelect.innerHTML = state.expenseCategories.map((name) => `<option value="${name}">${name}</option>`).join('');
  }

  if (dailyExpenseCategory) {
    dailyExpenseCategory.innerHTML = state.expenseCategories.map((name) => `<option value="${name}">${name}</option>`).join('');
  }

  if (monthlyIncomeCategory) {
    monthlyIncomeCategory.innerHTML = state.incomeCategories.map((name) => `<option value="${name}">${name}</option>`).join('');
  }

  const InvestmentAccountOptions = state.investmentAccounts.map((account) => `<option value="${account}">${account}</option>`).join('');
  if (investmentAccount) investmentAccount.innerHTML = InvestmentAccountOptions;
  if (investmentReturnAccount) investmentReturnAccount.innerHTML = InvestmentAccountOptions;

  const accountOptions = state.accounts.map((account) => `<option value="${account.name}">${account.name}</option>`).join('');
  if (dailyExpenseAccount) dailyExpenseAccount.innerHTML = accountOptions;
  if (monthlyIncomeAccount) monthlyIncomeAccount.innerHTML = accountOptions;
}

function aggregateByCategory(records) {
  const aggregate = {};
  records.forEach((record) => {
    const amount = Number(record.amount || 0);
    aggregate[record.category] = (aggregate[record.category] || 0) + amount;
  });
  return aggregate;
}

function getFixedExpenseBreakdownForMonth(monthKey) {
  const summary = {};
  state.fixedRules.forEach((rule) => {
    const amount = getFixedMonthlyAmount(rule, monthKey);
    summary[rule.category] = (summary[rule.category] || 0) + amount;
  });
  return summary;
}

function getMonthExpenseBreakdown(monthKey) {
  const manual = aggregateByCategory(getExpenseRecordsForMonth(monthKey));
  const fixed = getFixedExpenseBreakdownForMonth(monthKey);
  const investment = aggregateByCategory(
    state.investmentRecords
      .filter((record) => record.date && record.date.slice(0, 7) === monthKey)
      .map((record) => ({ category: record.destination || 'Investment', amount: Number(record.amount || 0) }))
  );
  const combined = { ...fixed };
  Object.entries(manual).forEach(([category, amount]) => {
    combined[category] = (combined[category] || 0) + amount;
  });
  Object.entries(investment).forEach(([category, amount]) => {
    combined[category] = (combined[category] || 0) + amount;
  });
  return combined;
}

function getMonthIncomeBreakdown(monthKey) {
  return aggregateByCategory(getIncomeRecordsForMonth(monthKey));
}

function getInvestmentProjectKey(record) {
  const account = (record.account || 'Account').trim();
  const stock = (record.stock || 'Project').trim();
  if (!account) return stock || 'Project';
  if (!stock) return account;
  if (account.toLowerCase().includes(stock.toLowerCase())) return account;
  return `${account} - ${stock}`;
}

function renderInvestmentCompare() {
  const container = document.getElementById('investment-compare');
  if (!container) return;

  const projectMap = new Map();

  state.investmentRecords.forEach((record) => {
    const key = getInvestmentProjectKey(record);
    const existing = projectMap.get(key) || { spent: 0, returned: 0 };
    existing.spent += Number(record.amount || 0);
    projectMap.set(key, existing);
  });

  state.investmentReturns.forEach((record) => {
    const key = getInvestmentProjectKey(record);
    const existing = projectMap.get(key) || { spent: 0, returned: 0 };
    existing.returned += Number(record.amount || 0);
    projectMap.set(key, existing);
  });

  const projects = [...projectMap.entries()].map(([project, values]) => {
    const spent = Number(values.spent || 0);
    const returned = Number(values.returned || 0);
    const rate = spent ? (returned / spent) * 100 : 0;
    return { project, spent, returned, rate };
  }).sort((a, b) => b.spent - a.spent);

  if (!projects.length) {
    container.innerHTML = '<p class="muted">No investment project data yet.</p>';
    return;
  }

  const maxRate = Math.max(...projects.map((item) => item.rate), 100);

  container.innerHTML = `
    <div class="breakdown-list">
      ${projects.map((item) => `
        <div class="breakdown-item">
          <div class="breakdown-meta">
            <span>${item.project}</span>
            <strong>${item.rate.toFixed(1)}% recovery</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min((item.rate / maxRate) * 100, 100)}%; background: linear-gradient(90deg, #8bb89f 0%, #b9c8d8 100%);"></div>
          </div>
          <div class="meta-row" style="margin-top: 6px;">
            <small>Spent ${money(item.spent)}</small>
            <small>Return ${money(item.returned)}</small>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderExpenseIncomeCompare() {
  const container = document.getElementById('expense-income-compare');
  if (!container) return;

  const monthKey = currentMonthKey();
  const expense = getMonthExpenseTotal(monthKey);
  const income = getMonthIncomeTotal(monthKey);
  const total = Math.max(income, expense, 1);
  const expensePct = (expense / total) * 100;
  const incomePct = (income / total) * 100;
  const net = income - expense;
  const netPct = income ? (net / income) * 100 : 0;

  container.innerHTML = `
    <div class="breakdown-shell">
      <div class="donut-chart" style="background: conic-gradient(#d7a9a1 0 ${expensePct}%, #8bb89f ${expensePct}% ${incomePct + expensePct}%);">
        <div class="donut-center">
          <strong>${money(expense)}</strong>
          <span>Expense</span>
        </div>
      </div>
      <div class="breakdown-list">
        <div class="breakdown-item">
          <div class="breakdown-meta">
            <span>Income</span>
            <strong>${money(income)} (${incomePct.toFixed(1)}%)</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(incomePct, 100)}%; background: linear-gradient(90deg, #8bb89f 0%, #b9c8d8 100%);"></div>
          </div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-meta">
            <span>Expense</span>
            <strong>${money(expense)} (${expensePct.toFixed(1)}%)</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(expensePct, 100)}%; background: linear-gradient(90deg, #d7a9a1 0%, #e7c7a3 100%);"></div>
          </div>
        </div>
        <div class="breakdown-item">
          <div class="breakdown-meta">
            <span>Net</span>
            <strong>${money(net)} (${netPct.toFixed(1)}%)</strong>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.min(Math.abs(netPct), 100)}%; background: linear-gradient(90deg, #c7bddb 0%, #c9d8c7 100%);"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderReports() {
  const container = document.getElementById('yearly-report-list');
  if (!container) return;

  renderExpenseIncomeCompare();

  const yearSet = new Set();
  getAllExpenseRecords().forEach((record) => {
    if (record.month) yearSet.add(record.month.slice(0, 4));
  });
  state.investmentRecords.forEach((record) => {
    if (record.date) yearSet.add(record.date.slice(0, 4));
  });
  getAllIncomeRecords().forEach((record) => {
    if (record.month) yearSet.add(record.month.slice(0, 4));
  });

  const years = [...yearSet].sort((a, b) => Number(b) - Number(a));
  if (!years.length) years.push(currentMonthKey().slice(0, 4));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  container.innerHTML = years.map((yearKey) => {
    const currentYear = new Date().getFullYear();
    const currentMonthNumber = new Date().getMonth() + 1;
    const maxMonthNumber = Number(yearKey) === currentYear ? currentMonthNumber : 12;
    const months = Array.from({ length: maxMonthNumber }, (_, index) => `${yearKey}-${String(maxMonthNumber - index).padStart(2, '0')}`);
    const yearExpense = months.reduce((sum, monthKey) => sum + getMonthExpenseTotal(monthKey), 0);
    const yearIncome = months.reduce((sum, monthKey) => sum + getMonthIncomeTotal(monthKey), 0);

    const monthRows = months.map((monthKey) => {
      const expense = getMonthExpenseTotal(monthKey);
      const income = getMonthIncomeTotal(monthKey);
      const net = income - expense;
      const monthNumber = Number(monthKey.split('-')[1]);
      const label = `${monthNames[monthNumber - 1]} ${yearKey}`;

      const expenseBreakdown = getMonthExpenseBreakdown(monthKey);
      const incomeBreakdown = getMonthIncomeBreakdown(monthKey);
      const expenseEntries = Object.entries(expenseBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount, pct: expense ? (amount / expense) * 100 : 0 }));
      const incomeEntries = Object.entries(incomeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => ({ category, amount, pct: income ? (amount / income) * 100 : 0 }));
      const expenseTotal = Object.values(expenseBreakdown).reduce((sum, value) => sum + Number(value || 0), 0);
      const incomeTotal = Object.values(incomeBreakdown).reduce((sum, value) => sum + Number(value || 0), 0);
      const expenseMarkup = expenseEntries.length ? buildDonutMarkup(expenseEntries, expenseTotal, ['#d7a9a1', '#c9d8c7', '#e7c7a3', '#b9c8d8', '#c7bddb', '#8bb89f']) : '<p class="muted">No expense</p>';
      const incomeMarkup = incomeEntries.length ? buildDonutMarkup(incomeEntries, incomeTotal, ['#8bb89f', '#d7a9a1', '#e7c7a3', '#b1cfe0', '#c9d8c7', '#c7bddb']) : '<p class="muted">No income</p>';

      return `
        <div class="year-month-row">
          <span>${label}</span>
          <span>Expense ${money(expense)}</span>
          <span>Income ${money(income)}</span>
          <span>Net ${money(net)}</span>
          <div class="month-donut-grid">
            ${expenseMarkup}
            ${incomeMarkup}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="year-report-card">
        <div class="year-report-header">
          <strong>${yearKey}</strong>
          <div class="year-report-summary">
            <span>Expense ${money(yearExpense)}</span>
            <span>Income ${money(yearIncome)}</span>
            <span>Net ${money(yearIncome - yearExpense)}</span>
          </div>
        </div>
        <div class="month-report-list">${monthRows}</div>
      </div>
    `;
  }).join('');
}

function handleExpenseCategorySubmit(event) {
  event.preventDefault();
  const input = document.getElementById('category-name');
  const value = input.value.trim();
  if (!value) return;
  if (!state.expenseCategories.includes(value)) {
    state.expenseCategories.push(value);
    saveState();
    renderAll();
  }
  input.value = '';
}

function handleIncomeCategorySubmit(event) {
  event.preventDefault();
  const input = document.getElementById('income-category-name');
  const value = input.value.trim();
  if (!value) return;
  if (!state.incomeCategories.includes(value)) {
    state.incomeCategories.push(value);
    saveState();
    renderAll();
  }
  input.value = '';
}

function handleFixedRuleSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('fixed-rule-name').value.trim();
  const amount = Number(document.getElementById('fixed-rule-amount').value || 0);
  const category = document.getElementById('fixed-rule-category').value;
  const cycle = document.getElementById('fixed-rule-cycle').value;

  if (!name || !amount || !category) return;

  state.fixedRules.push({
    id: crypto.randomUUID(),
    name,
    category,
    amount,
    cycle,
  });

  saveState();
  event.target.reset();
  renderAll();
}

function handleAccountSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('account-name').value.trim();
  const type = document.getElementById('account-type').value;
  const balance = Number(document.getElementById('account-balance').value || 0);

  if (!name || !type) return;

  const exists = state.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase());
  if (!exists) {
    state.accounts.push({ name, type, balance });
    saveState();
    renderAll();
  }

  event.target.reset();
}

function renderInvestmentAccountList() {
  const container = document.getElementById('investment-account-list');
  if (!container) return;

  container.innerHTML = state.investmentAccounts.map((account) => `
    <span class="tag">
      ${account}
      <button data-delete-investment-account="${account}" aria-label="Delete ${account}">×</button>
    </span>
  `).join('');

  document.querySelectorAll('[data-delete-investment-account]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const account = btn.dataset.deleteInvestmentAccount;
      state.investmentAccounts = state.investmentAccounts.filter((item) => item !== account);
      saveState();
      renderAll();
    });
  });
}

function renderInvestmentExpenses() {
  const container = document.getElementById('investment-expense-list');
  if (!container) return;

  if (!state.investmentRecords.length) {
    container.innerHTML = '<p class="muted">No investment spending recorded yet.</p>';
    return;
  }

  container.innerHTML = [...state.investmentRecords].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((record) => `
    <div class="record-item">
      <div>
        <strong>${record.stock || 'Investment expense'}</strong><br />
        <small>${record.date || '—'} · ${record.account || '—'}</small>
      </div>
      <div style="text-align: right;">
        <span class="amount-text amount-negative">${money(record.amount)}</span><br />
        <small>${record.note || ''}</small>
      </div>
    </div>
  `).join('');
}

function renderInvestmentReturns() {
  const container = document.getElementById('investment-return-list');
  if (!container) return;

  if (!state.investmentReturns.length) {
    container.innerHTML = '<p class="muted">No investment return recorded yet.</p>';
    return;
  }

  container.innerHTML = [...state.investmentReturns].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((record) => `
    <div class="record-item">
      <div>
        <strong>${record.stock || 'Investment return'}</strong><br />
        <small>${record.date || '—'} · ${record.account || '—'}</small>
      </div>
      <div style="text-align: right;">
        <span class="amount-text amount-positive">${money(record.amount)}</span><br />
        <small>${record.note || ''}</small>
      </div>
    </div>
  `).join('');
}

function handleDailyExpenseSubmit(event) {
  event.preventDefault();
  const date = document.getElementById('daily-expense-date').value;
  const amount = Number(document.getElementById('daily-expense-amount').value || 0);
  const category = document.getElementById('daily-expense-category').value;
  const account = document.getElementById('daily-expense-account').value;
  const note = document.getElementById('daily-expense-note').value.trim();

  if (!date || !amount || !category || !account) return;

  const month = date.slice(0, 7);
  state.monthlyExpenseRecords.push({
    id: crypto.randomUUID(),
    month,
    category,
    amount,
    account,
    note,
    date,
    direction: 'expense',
  });

  const targetAccount = state.accounts.find((item) => item.name === account);
  if (targetAccount) {
    targetAccount.balance = Number(targetAccount.balance || 0) - amount;
    if (targetAccount.type === 'credit_card') {
      targetAccount.balance = Number(targetAccount.balance || 0) + amount;
    }
  }

  saveState();
  event.target.reset();
  setDefaultMonthInputs();
  renderAll();
}

function handleInvestmentAccountSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('investment-account-name');
  const value = input.value.trim();
  if (!value) return;
  if (!state.investmentAccounts.includes(value)) {
    state.investmentAccounts.push(value);
    saveState();
    renderAll();
  }
  input.value = '';
}

function handleInvestmentSubmit(event) {
  event.preventDefault();
  const date = document.getElementById('investment-date').value;
  const amount = Number(document.getElementById('investment-amount').value || 0);
  const stock = document.getElementById('investment-stock').value.trim();
  const account = document.getElementById('investment-account').value;
  const note = document.getElementById('investment-note').value.trim();

  if (!date || !amount || !stock || !account) return;

  state.investmentRecords.push({
    id: crypto.randomUUID(),
    date,
    amount,
    stock,
    account,
    note,
    direction: 'expense',
  });

  saveState();
  event.target.reset();
  renderAll();
}

function handleInvestmentReturnSubmit(event) {
  event.preventDefault();
  const date = document.getElementById('investment-return-date').value;
  const stock = document.getElementById('investment-return-stock').value.trim();
  const amount = Number(document.getElementById('investment-return-amount').value || 0);
  const account = document.getElementById('investment-return-account').value;
  const note = document.getElementById('investment-return-note').value.trim();

  if (!date || !stock || !amount || !account) return;

  state.investmentReturns.push({
    id: crypto.randomUUID(),
    date,
    stock,
    amount,
    account,
    note,
    direction: 'return',
  });

  saveState();
  event.target.reset();
  renderAll();
}

function handleMonthlyIncomeSubmit(event) {
  event.preventDefault();
  const month = document.getElementById('monthly-income-month').value;
  const amount = Number(document.getElementById('monthly-income-amount').value || 0);
  const category = document.getElementById('monthly-income-category').value;
  const account = document.getElementById('monthly-income-account').value;
  const note = document.getElementById('monthly-income-note').value.trim();

  if (!month || !amount || !category || !account) return;

  state.monthlyIncomeRecords.push({
    id: crypto.randomUUID(),
    month,
    category,
    amount,
    account,
    note,
    direction: 'income',
  });

  const targetAccount = state.accounts.find((item) => item.name === account);
  if (targetAccount) {
    targetAccount.balance = Number(targetAccount.balance || 0) + amount;
  }

  saveState();
  event.target.reset();
  setDefaultMonthInputs();
  renderAll();
}

function setActiveSection(sectionId) {
  const target = sectionId || (window.location.hash ? window.location.hash.replace('#', '') : 'expenses');

  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === target);
  });

  document.querySelectorAll('.section-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.target === target);
  });

  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', `#${target}`);
  }
}

function bindEvents() {
  document.querySelectorAll('.section-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveSection(link.dataset.target);
    });
  });

  document.getElementById('account-form').addEventListener('submit', handleAccountSubmit);
  document.getElementById('category-form').addEventListener('submit', handleExpenseCategorySubmit);
  document.getElementById('fixed-rule-form').addEventListener('submit', handleFixedRuleSubmit);
  document.getElementById('daily-expense-form').addEventListener('submit', handleDailyExpenseSubmit);
  document.getElementById('investment-account-form').addEventListener('submit', handleInvestmentAccountSubmit);
  document.getElementById('investment-expense-form').addEventListener('submit', handleInvestmentSubmit);
  document.getElementById('investment-return-form').addEventListener('submit', handleInvestmentReturnSubmit);
  document.getElementById('income-category-form').addEventListener('submit', handleIncomeCategorySubmit);
  document.getElementById('monthly-income-form').addEventListener('submit', handleMonthlyIncomeSubmit);

  const clearModal = document.getElementById('clear-data-modal');
  const accountDeleteModal = document.getElementById('account-delete-modal');
  const expenseDeleteModal = document.getElementById('expense-delete-modal');
  const recurringDeleteModal = document.getElementById('recurring-delete-modal');
  const incomeDeleteModal = document.getElementById('income-delete-modal');
  const openClearModal = () => {
    if (clearModal) clearModal.classList.remove('hidden');
  };
  const closeClearModal = () => {
    if (clearModal) clearModal.classList.add('hidden');
  };

  document.getElementById('reset-demo').addEventListener('click', openClearModal);
  document.getElementById('cancel-clear-data').addEventListener('click', closeClearModal);
  document.getElementById('confirm-clear-data').addEventListener('click', () => {
    state = createDefaultState();
    saveState();
    renderAll();
    closeClearModal();
  });

  const cancelAccountDelete = document.getElementById('cancel-account-delete');
  const confirmAccountDelete = document.getElementById('confirm-account-delete');
  const cancelExpenseDelete = document.getElementById('cancel-expense-delete');
  const confirmExpenseDelete = document.getElementById('confirm-expense-delete');
  const cancelRecurringDelete = document.getElementById('cancel-recurring-delete');
  const confirmRecurringDelete = document.getElementById('confirm-recurring-delete');
  const cancelIncomeDelete = document.getElementById('cancel-income-delete');
  const confirmIncomeDelete = document.getElementById('confirm-income-delete');

  if (cancelAccountDelete) cancelAccountDelete.addEventListener('click', closeAccountDeleteModal);
  if (confirmAccountDelete) {
    confirmAccountDelete.addEventListener('click', () => {
      if (pendingAccountDeleteName) {
        deleteAccountByName(pendingAccountDeleteName);
        saveState();
        renderAll();
      }
      closeAccountDeleteModal();
    });
  }

  if (cancelExpenseDelete) cancelExpenseDelete.addEventListener('click', closeExpenseDeleteModal);
  if (confirmExpenseDelete) {
    confirmExpenseDelete.addEventListener('click', () => {
      if (pendingExpenseDeleteId) {
        deleteExpenseRecord(pendingExpenseDeleteId);
        saveState();
        renderAll();
      }
      closeExpenseDeleteModal();
    });
  }

  if (cancelRecurringDelete) cancelRecurringDelete.addEventListener('click', closeRecurringDeleteModal);
  if (confirmRecurringDelete) {
    confirmRecurringDelete.addEventListener('click', () => {
      if (pendingRecurringDeleteId) {
        deleteRecurringRule(pendingRecurringDeleteId);
        saveState();
        renderAll();
      }
      closeRecurringDeleteModal();
    });
  }

  if (cancelIncomeDelete) cancelIncomeDelete.addEventListener('click', closeIncomeDeleteModal);
  if (confirmIncomeDelete) {
    confirmIncomeDelete.addEventListener('click', () => {
      if (pendingIncomeDeleteId) {
        deleteIncomeRecord(pendingIncomeDeleteId);
        saveState();
        renderAll();
      }
      closeIncomeDeleteModal();
    });
  }

  if (clearModal) {
    clearModal.addEventListener('click', (event) => {
      if (event.target === clearModal) closeClearModal();
    });
  }

  if (accountDeleteModal) {
    accountDeleteModal.addEventListener('click', (event) => {
      if (event.target === accountDeleteModal) closeAccountDeleteModal();
    });
  }

  if (expenseDeleteModal) {
    expenseDeleteModal.addEventListener('click', (event) => {
      if (event.target === expenseDeleteModal) closeExpenseDeleteModal();
    });
  }

  if (recurringDeleteModal) {
    recurringDeleteModal.addEventListener('click', (event) => {
      if (event.target === recurringDeleteModal) closeRecurringDeleteModal();
    });
  }

  if (incomeDeleteModal) {
    incomeDeleteModal.addEventListener('click', (event) => {
      if (event.target === incomeDeleteModal) closeIncomeDeleteModal();
    });
  }
}

function renderAll() {
  renderFixedSpendingSummary();
  renderDailyExpenseSummary();
  renderRecurringSpendingList();
  renderExpenseEntries();
  renderInvestmentAccountList();
  renderInvestmentCompare();
  renderInvestmentExpenses();
  renderInvestmentReturns();
  renderAccounts();
  renderIncomeBreakdownChart();
  renderIncomeEntries();
  renderExpenseCategoryList();
  renderIncomeCategoryList();
  updateSelects();
  setDefaultMonthInputs();
  renderReports();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

async function bootstrap() {
  state = await loadState();
  archivePreviousMonthData();
  bindEvents();
  const initialSection = window.location.hash ? window.location.hash.replace('#', '') : 'expenses';
  setActiveSection(initialSection);
  renderAll();
  registerServiceWorker();
}

bootstrap();
