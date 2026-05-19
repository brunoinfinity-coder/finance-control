import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  Download,
  FileJson,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PiggyBank,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabaseClient';

const STORAGE_KEY = 'finance-control:v1';
const CLOUD_SAVE_DELAY = 800;

const DEFAULT_CATEGORIES = [
  'Mercado',
  'Comer Fora',
  'Viagem',
  'Combustível',
  'Entretenimento',
  'Beleza',
  'Presente',
  'Investimento',
  'Compra não Planejada',
  'Cigarro',
  'Farmácia',
  'Nardo',
  'Outros',
];

const PAYMENT_METHODS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Boleto', 'Alimentação'];
const CASH_PAYMENT_METHODS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Boleto'];
const TYPES = ['Receita', 'Conta', 'Despesa', 'Dívida', 'Investimento'];
const STATUSES = ['Pago', 'Pendente', 'Planejado'];
const CHART_COLORS = ['#111827', '#64748b', '#0f766e', '#2563eb', '#d97706', '#be123c', '#7c3aed'];

const now = new Date();
const TODAY = toDateInput(now);
const CURRENT_MONTH = monthFromDate(TODAY);

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthFromDate(date) {
  return String(date || TODAY).slice(0, 7) || CURRENT_MONTH;
}

function nextMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateFromMonthDay(month, day) {
  const [year, monthIndex] = month.split('-').map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${month}-${String(Math.min(Number(day) || 1, lastDay)).padStart(2, '0')}`;
}

function splitMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, monthNumber };
}

function joinMonth(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1));
}

function money(value) {
  return currency.format(Number(value) || 0);
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  return Number(String(value || '0').replace(/\./g, '').replace(',', '.')) || 0;
}

function uid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultAccount() {
  return {
    currentBalance: 0,
    currentIncomeExpected: 0,
    nextIncomeExpected: 0,
    previousBalance: 0,
    minimumReserve: 0,
  };
}

function defaultPlanning(month = CURRENT_MONTH) {
  return {
    month,
    renda: 0,
    contas: 0,
    despesas: 0,
    dividas: 0,
    investimentos: 0,
    reserva: 0,
    categories: Object.fromEntries(DEFAULT_CATEGORIES.map((category) => [category, 0])),
  };
}

function defaultMonthlyRevenue() {
  return {
    brunoSalary: 0,
    mariahSalary: 0,
    extraIncome: 0,
    otherIncome: 0,
    brunoFoodCard: 0,
    mariahFoodCard: 0,
    foodCardOutflows: [],
  };
}

function normalizePaymentMethod(method) {
  const raw = String(method || 'Pix').trim().toLowerCase();
  if (raw.includes('aliment')) return 'Alimentação';
  if (raw.includes('cred') || raw.includes('créd')) return 'Crédito';
  if (raw.includes('deb') || raw.includes('déb')) return 'Débito';
  if (raw.includes('din')) return 'Dinheiro';
  if (raw.includes('bol')) return 'Boleto';
  if (raw.includes('pix')) return 'Pix';
  return PAYMENT_METHODS.includes(method) ? method : 'Pix';
}

function normalizeStatus(status, paidValue) {
  if (parseMoney(paidValue) > 0) return 'Pago';
  const raw = String(status || '').toLowerCase();
  if (raw.includes('pag') || raw === 'paid') return 'Pago';
  if (raw.includes('plan')) return 'Planejado';
  return raw ? 'Pendente' : 'Pago';
}

function normalizeEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => {
    const date = entry.date || entry.entry_date || entry.data || TODAY;
    return {
      id: entry.id || uid(),
      date,
      month: entry.month || entry.entry_month || monthFromDate(date),
      type: entry.type || entry.tipo || 'Despesa',
      description: entry.description || entry.descricao || entry.descrição || entry.name || 'Lançamento',
      category: entry.category || entry.categoria || 'Outros',
      paymentMethod: normalizePaymentMethod(entry.paymentMethod || entry.payment_method || entry.formaPagamento || entry.forma_de_pagamento),
      value: Number(entry.value ?? entry.valor ?? entry.amount ?? 0),
      status: entry.status || 'Pago',
      note: entry.note || entry.observacao || entry.observação || '',
    };
  });
}

function normalizeFixedBills(fixedBills) {
  return (Array.isArray(fixedBills) ? fixedBills : []).map((bill) => {
    const month = bill.startMonth || bill.month || bill.mes || monthFromDate(bill.date || bill.dueDate || TODAY);
    const paidMonths = bill.paidMonths && typeof bill.paidMonths === 'object' ? bill.paidMonths : {};
    const paid = bill.status === 'Pago' || bill.status === 'paid' || bill.paid === true || parseMoney(bill.paidValue || bill.pago || bill.valorPago) > 0;
    return {
      id: bill.id || uid(),
      name: bill.name || bill.nome || bill.description || bill.descricao || 'Conta fixa',
      value: Number(bill.value ?? bill.valor ?? bill.amount ?? bill.plannedValue ?? 0),
      dueDay: Number(bill.dueDay || bill.due_day || bill.vencimento || bill.day || 1),
      category: bill.category || bill.categoria || 'Outros',
      recurring: bill.recurring !== false,
      active: bill.active !== false,
      startMonth: month,
      paidMonths: paid ? { ...paidMonths, [month]: true } : paidMonths,
    };
  });
}

function normalizeMonthlyRevenue(rawMonthlyRevenue = {}) {
  return Object.entries(rawMonthlyRevenue || {}).reduce((acc, [month, revenue]) => {
    acc[month] = {
      ...defaultMonthlyRevenue(),
      brunoSalary: Number(revenue.brunoSalary || revenue.bruno_salary || 0),
      mariahSalary: Number(revenue.mariahSalary || revenue.mariah_salary || 0),
      extraIncome: Number(revenue.extraIncome || revenue.extra_income || 0),
      otherIncome: Number(revenue.otherIncome || revenue.other_income || 0),
      brunoFoodCard: Number(revenue.brunoFoodCard || revenue.bruno_food_card || 0),
      mariahFoodCard: Number(revenue.mariahFoodCard || revenue.mariah_food_card || 0),
      foodCardOutflows: normalizeFoodCardOutflows(revenue.foodCardOutflows || revenue.food_card_outflows || []),
    };
    return acc;
  }, {});
}

function normalizeFoodCardOutflows(outflows) {
  return (Array.isArray(outflows) ? outflows : []).map((outflow) => ({
    id: outflow.id || uid(),
    date: outflow.date || outflow.data || TODAY,
    description: outflow.description || outflow.descricao || outflow.descrição || 'Saída alimentação',
    value: Number(outflow.value ?? outflow.valor ?? 0),
    source: outflow.source || outflow.origem || 'Outro',
  }));
}

function migratePlanningToRevenue(planning = {}, account = defaultAccount()) {
  const revenue = {};
  Object.entries(planning || {}).forEach(([month, plan]) => {
    const plannedCash = Number(plan.renda || 0);
    if (plannedCash > 0) {
      revenue[month] = {
        ...defaultMonthlyRevenue(),
        otherIncome: plannedCash,
      };
    }
  });

  if (!revenue[CURRENT_MONTH]) {
    revenue[CURRENT_MONTH] = {
      ...defaultMonthlyRevenue(),
      otherIncome: Number(account.currentIncomeExpected || 0),
    };
  }

  const next = nextMonth(CURRENT_MONTH);
  if (!revenue[next] && Number(account.nextIncomeExpected || 0) > 0) {
    revenue[next] = {
      ...defaultMonthlyRevenue(),
      otherIncome: Number(account.nextIncomeExpected || 0),
    };
  }

  return revenue;
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const planning = parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : {};
    const account = { ...defaultAccount(), ...(parsed.account || {}) };
    const monthlyRevenue = {
      ...migratePlanningToRevenue(planning, account),
      ...normalizeMonthlyRevenue(parsed.monthlyRevenue),
    };

    return {
      entries: normalizeEntries(parsed.entries),
      fixedBills: normalizeFixedBills(parsed.fixedBills),
      account,
      planning: Object.keys(planning).length ? planning : { [CURRENT_MONTH]: defaultPlanning(CURRENT_MONTH), [nextMonth(CURRENT_MONTH)]: defaultPlanning(nextMonth(CURRENT_MONTH)) },
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
      monthlyRevenue,
    };
  } catch {
    return {
      entries: [],
      fixedBills: [],
      account: defaultAccount(),
      planning: { [CURRENT_MONTH]: defaultPlanning(CURRENT_MONTH), [nextMonth(CURRENT_MONTH)]: defaultPlanning(nextMonth(CURRENT_MONTH)) },
      categories: DEFAULT_CATEGORIES,
      monthlyRevenue: { [CURRENT_MONTH]: defaultMonthlyRevenue() },
    };
  }
}

function localSnapshotFromState({ entries, fixedBills, account, planning, categories, monthlyRevenue }) {
  return { entries, fixedBills, account, planning, categories, monthlyRevenue };
}

function sumBy(items, predicate = () => true) {
  return items.filter(predicate).reduce((total, item) => total + Number(item.value || 0), 0);
}

function fixedBillInstances(fixedBills, month) {
  return fixedBills
    .filter((bill) => bill.active && (bill.recurring || bill.startMonth === month))
    .map((bill) => ({
      ...bill,
      dueDate: dateFromMonthDay(month, bill.dueDay),
      status: bill.paidMonths?.[month] ? 'Pago' : 'Pendente',
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function statusForDueDate(dueDate, paid) {
  if (paid) return { label: 'Paga', tone: 'green', icon: CheckCircle2 };
  const today = new Date(`${TODAY}T00:00:00`);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return { label: 'Vencida', tone: 'red', icon: AlertCircle };
  if (diffDays === 0) return { label: 'Vence hoje', tone: 'amber', icon: CalendarDays };
  if (diffDays <= 7) return { label: `${diffDays} dia(s)`, tone: 'amber', icon: CalendarDays };
  return { label: 'Futura', tone: 'slate', icon: CalendarDays };
}

function accountFromSettings(settings) {
  return {
    currentBalance: Number(settings?.current_balance || 0),
    currentIncomeExpected: Number(settings?.current_income_expected || 0),
    nextIncomeExpected: Number(settings?.next_income_expected || 0),
    previousBalance: Number(settings?.previous_balance || 0),
    minimumReserve: Number(settings?.minimum_reserve || 0),
  };
}

function settingsFromAccount(account, userId) {
  return {
    user_id: userId,
    current_balance: Number(account.currentBalance || 0),
    current_income_expected: Number(account.currentIncomeExpected || 0),
    next_income_expected: Number(account.nextIncomeExpected || 0),
    previous_balance: Number(account.previousBalance || 0),
    minimum_reserve: Number(account.minimumReserve || 0),
  };
}

function fixedBillRows(fixedBills, userId) {
  return fixedBills.map((bill) => ({
    id: bill.id,
    user_id: userId,
    name: bill.name,
    value: Number(bill.value || 0),
    due_day: Number(bill.dueDay || 1),
    category: bill.category || 'Outros',
    recurring: bill.recurring !== false,
    active: bill.active !== false,
    start_month: bill.startMonth || CURRENT_MONTH,
  }));
}

function occurrenceRows(fixedBills, userId) {
  return fixedBills.flatMap((bill) =>
    Object.entries(bill.paidMonths || {})
      .filter(([, paid]) => paid)
      .map(([month]) => {
        const { year, monthNumber } = splitMonth(month);
        return {
          user_id: userId,
          fixed_bill_id: bill.id,
          year,
          month: monthNumber,
          status: 'paid',
          paid_at: new Date().toISOString(),
        };
      }),
  );
}

function entryRows(entries, userId) {
  return entries.map((entry) => ({
    id: entry.id,
    user_id: userId,
    description: entry.description,
    value: Number(entry.value || 0),
    category: entry.category || 'Outros',
    payment_method: entry.paymentMethod || 'Pix',
    entry_date: entry.date || TODAY,
    entry_month: entry.month || monthFromDate(entry.date || TODAY),
    type: entry.type || 'Despesa',
    status: entry.status || 'Pago',
    note: entry.note || '',
  }));
}

function planningRows(planning, userId) {
  return Object.entries(planning || {}).map(([month, plan]) => {
    const { year, monthNumber } = splitMonth(month);
    return {
      user_id: userId,
      year,
      month: monthNumber,
      expected_income: Number(plan.renda || 0),
      planned_variable_expenses: Number(plan.despesas || 0),
      planned_debts: Number(plan.dividas || 0),
      planned_investments: Number(plan.investimentos || 0),
      target_reserve: Number(plan.reserva || 0),
    };
  });
}

function monthlyRevenueRows(monthlyRevenue, userId) {
  return Object.entries(monthlyRevenue || {}).map(([month, revenue]) => {
    const { year, monthNumber } = splitMonth(month);
    return {
      user_id: userId,
      year,
      month: monthNumber,
      bruno_salary: Number(revenue.brunoSalary || 0),
      mariah_salary: Number(revenue.mariahSalary || 0),
      extra_income: Number(revenue.extraIncome || 0),
      other_income: Number(revenue.otherIncome || 0),
      bruno_food_card: Number(revenue.brunoFoodCard || 0),
      mariah_food_card: Number(revenue.mariahFoodCard || 0),
      food_card_outflows: normalizeFoodCardOutflows(revenue.foodCardOutflows || []),
    };
  });
}

function categoryRows(categories, userId) {
  return categories.map((name) => ({ user_id: userId, name }));
}

function buildStateFromCloud({ settings, fixedBillsRows, occurrenceRowsData, entriesRows, planningRowsData, categoriesRows, monthlyRevenueRowsData }) {
  const paidByBill = occurrenceRowsData.reduce((acc, row) => {
    const month = joinMonth(row.year, row.month);
    acc[row.fixed_bill_id] = { ...(acc[row.fixed_bill_id] || {}), [month]: row.status === 'paid' };
    return acc;
  }, {});

  const fixedBills = fixedBillsRows.map((bill) => ({
    id: bill.id,
    name: bill.name,
    value: Number(bill.value || 0),
    dueDay: Number(bill.due_day || 1),
    category: bill.category || 'Outros',
    recurring: bill.recurring !== false,
    active: bill.active !== false,
    startMonth: bill.start_month || CURRENT_MONTH,
    paidMonths: paidByBill[bill.id] || {},
  }));

  const entries = entriesRows.map((entry) => ({
    id: entry.id,
    date: entry.entry_date || TODAY,
    month: entry.entry_month || monthFromDate(entry.entry_date || TODAY),
    type: entry.type || 'Despesa',
    description: entry.description || 'Lançamento',
    category: entry.category || 'Outros',
    paymentMethod: normalizePaymentMethod(entry.payment_method),
    value: Number(entry.value || 0),
    status: entry.status || 'Pago',
    note: entry.note || '',
  }));

  const planning = planningRowsData.reduce((acc, plan) => {
    const month = joinMonth(plan.year, plan.month);
    acc[month] = {
      ...defaultPlanning(month),
      renda: Number(plan.expected_income || 0),
      despesas: Number(plan.planned_variable_expenses || 0),
      dividas: Number(plan.planned_debts || 0),
      investimentos: Number(plan.planned_investments || 0),
      reserva: Number(plan.target_reserve || 0),
    };
    return acc;
  }, {});

  const monthlyRevenue = monthlyRevenueRowsData.reduce((acc, revenue) => {
    const month = joinMonth(revenue.year, revenue.month);
    acc[month] = {
      ...defaultMonthlyRevenue(),
      brunoSalary: Number(revenue.bruno_salary || 0),
      mariahSalary: Number(revenue.mariah_salary || 0),
      extraIncome: Number(revenue.extra_income || 0),
      otherIncome: Number(revenue.other_income || 0),
      brunoFoodCard: Number(revenue.bruno_food_card || 0),
      mariahFoodCard: Number(revenue.mariah_food_card || 0),
      foodCardOutflows: normalizeFoodCardOutflows(revenue.food_card_outflows || []),
    };
    return acc;
  }, {});

  const categories = categoriesRows.length ? categoriesRows.map((category) => category.name) : DEFAULT_CATEGORIES;
  const account = { ...defaultAccount(), ...accountFromSettings(settings) };

  return {
    entries: normalizeEntries(entries),
    fixedBills: normalizeFixedBills(fixedBills),
    account,
    planning: Object.keys(planning).length ? planning : { [CURRENT_MONTH]: defaultPlanning(CURRENT_MONTH), [nextMonth(CURRENT_MONTH)]: defaultPlanning(nextMonth(CURRENT_MONTH)) },
    categories,
    monthlyRevenue: Object.keys(monthlyRevenue).length ? monthlyRevenue : migratePlanningToRevenue(planning, account),
  };
}

function getMonthRevenue(monthlyRevenue, month) {
  return { ...defaultMonthlyRevenue(), ...(monthlyRevenue[month] || {}) };
}

function calculateMonth({ month, entries, fixedBills, monthlyRevenue, account }) {
  const revenue = getMonthRevenue(monthlyRevenue, month);
  const bills = fixedBillInstances(fixedBills, month);
  const monthEntries = entries.filter((entry) => entry.month === month);
  const expenses = monthEntries.filter((entry) => entry.type !== 'Receita' && entry.type !== 'Conta');
  const paidExpenses = expenses.filter((entry) => entry.status === 'Pago');
  const cashRevenue = Number(revenue.brunoSalary || 0) + Number(revenue.mariahSalary || 0) + Number(revenue.extraIncome || 0) + Number(revenue.otherIncome || 0);
  const foodRevenue = Number(revenue.brunoFoodCard || 0) + Number(revenue.mariahFoodCard || 0);
  const foodOutflows = sumBy(revenue.foodCardOutflows || []);
  const foodExpenses = sumBy(paidExpenses, (entry) => entry.paymentMethod === 'Alimentação');
  const cashExpenses = sumBy(paidExpenses, (entry) => entry.paymentMethod !== 'Alimentação');
  const billsTotal = sumBy(bills);
  const paidBills = sumBy(bills, (bill) => bill.status === 'Pago');
  const pendingBills = sumBy(bills, (bill) => bill.status !== 'Pago');
  const foodBalance = foodRevenue - foodExpenses - foodOutflows;
  const cashForecast = cashRevenue - billsTotal - cashExpenses;

  const byPayment = PAYMENT_METHODS.map((method) => ({
    name: method,
    value: sumBy(paidExpenses, (entry) => entry.paymentMethod === method),
  }));

  const byCategory = DEFAULT_CATEGORIES.map((category) => ({
    name: category,
    value: sumBy(paidExpenses, (entry) => entry.category === category),
  })).filter((item) => item.value > 0);

  return {
    revenue,
    bills,
    monthEntries,
    expenses,
    paidExpenses,
    cashRevenue,
    foodRevenue,
    foodOutflows,
    foodExpenses,
    cashExpenses,
    billsTotal,
    paidBills,
    pendingBills,
    foodBalance,
    cashForecast,
    accountBalance: Number(account.currentBalance || 0),
    byPayment,
    byCategory,
    largestCategory: byCategory.sort((a, b) => b.value - a.value)[0],
  };
}

function mergeUnique(existing, incoming, signatureFn) {
  const signatures = new Set(existing.map(signatureFn));
  const next = [...existing];
  let added = 0;
  let ignored = 0;

  incoming.forEach((item) => {
    const signature = signatureFn(item);
    if (signatures.has(signature)) {
      ignored += 1;
      return;
    }
    signatures.add(signature);
    next.push(item);
    added += 1;
  });

  return { next, added, ignored };
}

function normalizeImportPayload(parsed) {
  const entries = normalizeEntries(parsed.entries || parsed.lancamentos || parsed.lançamentos || []);
  const importedBills = normalizeFixedBills(parsed.fixedBills || parsed.contas || []);
  const billsFromEntries = entries
    .filter((entry) => entry.type === 'Conta')
    .map((entry) => ({
      id: entry.id,
      name: entry.description,
      value: Number(entry.value || 0),
      dueDay: Number(entry.date?.slice(8, 10) || 1),
      category: entry.category || 'Outros',
      recurring: false,
      active: true,
      startMonth: entry.month,
      paidMonths: entry.status === 'Pago' ? { [entry.month]: true } : {},
    }));

  return {
    entries: entries.filter((entry) => entry.type !== 'Conta'),
    fixedBills: [...importedBills, ...billsFromEntries],
    account: parsed.account && typeof parsed.account === 'object' ? { ...defaultAccount(), ...parsed.account } : null,
    planning: parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : {},
    categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    monthlyRevenue: normalizeMonthlyRevenue(parsed.monthlyRevenue || parsed.monthly_revenue || {}),
  };
}

function App() {
  const initialData = useMemo(loadData, []);
  const [entries, setEntries] = useState(initialData.entries);
  const [fixedBills, setFixedBills] = useState(initialData.fixedBills);
  const [account, setAccount] = useState(initialData.account);
  const [planning, setPlanning] = useState(initialData.planning);
  const [categories, setCategories] = useState(initialData.categories);
  const [monthlyRevenue, setMonthlyRevenue] = useState(initialData.monthlyRevenue);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [activeView, setActiveView] = useState('dashboard');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState({ category: '', paymentMethod: '' });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [quickExpense, setQuickExpense] = useState({
    date: TODAY,
    description: '',
    value: '',
    category: 'Outros',
    paymentMethod: 'Pix',
    status: 'Pago',
    note: '',
    type: 'Despesa',
  });
  const [billForm, setBillForm] = useState({
    name: '',
    value: '',
    dueDay: '10',
    category: 'Outros',
    recurring: true,
    active: true,
  });
  const [foodOutflowForm, setFoodOutflowForm] = useState({
    date: TODAY,
    description: '',
    value: '',
    source: 'Alimentação Bruno',
  });
  const [importMessage, setImportMessage] = useState('');
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [localMigrationSnapshot, setLocalMigrationSnapshot] = useState(null);
  const fileInputRef = useRef(null);

  const monthStats = useMemo(
    () => calculateMonth({ month: selectedMonth, entries, fixedBills, monthlyRevenue, account }),
    [account, entries, fixedBills, monthlyRevenue, selectedMonth],
  );

  const filteredExpenses = monthStats.expenses
    .filter((entry) => !expenseFilters.category || entry.category === expenseFilters.category)
    .filter((entry) => !expenseFilters.paymentMethod || entry.paymentMethod === expenseFilters.paymentMethod)
    .sort((a, b) => b.date.localeCompare(a.date));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, fixedBills, account, planning, categories, monthlyRevenue }));
  }, [entries, fixedBills, account, planning, categories, monthlyRevenue]);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCloudLoaded(false);
      setAuthMessage('');
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user || !supabase) {
      setCloudLoaded(false);
      return;
    }

    loadCloudData(session.user.id);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !supabase || !cloudLoaded) return undefined;

    const timeout = window.setTimeout(() => {
      saveCloudData(session.user.id, localSnapshotFromState({ entries, fixedBills, account, planning, categories, monthlyRevenue }));
    }, CLOUD_SAVE_DELAY);

    return () => window.clearTimeout(timeout);
  }, [account, categories, cloudLoaded, entries, fixedBills, monthlyRevenue, planning, session?.user?.id]);

  async function loadCloudData(userId) {
    setCloudLoading(true);
    setSyncMessage('Carregando dados da nuvem...');
    setLocalMigrationSnapshot((current) => current || loadData());

    try {
      const [settingsResult, fixedBillsResult, occurrencesResult, entriesResult, planningResult, categoriesResult, monthlyRevenueResult] = await Promise.all([
        supabase.from('financial_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('fixed_bills').select('*').eq('user_id', userId).order('due_day'),
        supabase.from('fixed_bill_occurrences').select('*').eq('user_id', userId),
        supabase.from('quick_expenses').select('*').eq('user_id', userId).order('entry_date', { ascending: false }),
        supabase.from('monthly_planning').select('*').eq('user_id', userId),
        supabase.from('categories').select('*').eq('user_id', userId).order('name'),
        supabase.from('monthly_revenue').select('*').eq('user_id', userId),
      ]);

      const error =
        settingsResult.error ||
        fixedBillsResult.error ||
        occurrencesResult.error ||
        entriesResult.error ||
        planningResult.error ||
        categoriesResult.error ||
        monthlyRevenueResult.error;
      if (error) throw error;

      const hasCloudData =
        settingsResult.data ||
        fixedBillsResult.data?.length ||
        occurrencesResult.data?.length ||
        entriesResult.data?.length ||
        planningResult.data?.length ||
        categoriesResult.data?.length ||
        monthlyRevenueResult.data?.length;

      if (hasCloudData) {
        const cloudState = buildStateFromCloud({
          settings: settingsResult.data,
          fixedBillsRows: fixedBillsResult.data || [],
          occurrenceRowsData: occurrencesResult.data || [],
          entriesRows: entriesResult.data || [],
          planningRowsData: planningResult.data || [],
          categoriesRows: categoriesResult.data || [],
          monthlyRevenueRowsData: monthlyRevenueResult.data || [],
        });

        setEntries(cloudState.entries);
        setFixedBills(cloudState.fixedBills);
        setAccount(cloudState.account);
        setPlanning(cloudState.planning);
        setCategories(cloudState.categories);
        setMonthlyRevenue(cloudState.monthlyRevenue);
        setSyncMessage('Dados carregados do Supabase.');
      } else {
        setSyncMessage('Conta sem dados na nuvem. Use a migração para enviar seus dados locais.');
      }

      setCloudLoaded(true);
    } catch (error) {
      setSyncMessage(`Não foi possível carregar do Supabase: ${error.message}`);
      setCloudLoaded(false);
    } finally {
      setCloudLoading(false);
    }
  }

  async function saveCloudData(userId, snapshot) {
    try {
      setSyncMessage('Sincronizando...');

      const settingsResult = await supabase.from('financial_settings').upsert(settingsFromAccount(snapshot.account, userId), { onConflict: 'user_id' });
      if (settingsResult.error) throw settingsResult.error;

      await replaceUserRows('categories', categoryRows(snapshot.categories, userId), userId);
      await replaceUserRows('quick_expenses', entryRows(snapshot.entries, userId), userId);
      await replaceUserRows('monthly_planning', planningRows(snapshot.planning, userId), userId);
      await replaceUserRows('monthly_revenue', monthlyRevenueRows(snapshot.monthlyRevenue, userId), userId);
      await replaceFixedBills(snapshot.fixedBills, userId);

      setSyncMessage('Dados sincronizados com Supabase.');
    } catch (error) {
      setSyncMessage(`Falha ao sincronizar: ${error.message}`);
    }
  }

  async function replaceUserRows(table, rows, userId) {
    const deleteResult = await supabase.from(table).delete().eq('user_id', userId);
    if (deleteResult.error) throw deleteResult.error;
    if (!rows.length) return;
    const insertResult = await supabase.from(table).insert(rows);
    if (insertResult.error) throw insertResult.error;
  }

  async function replaceFixedBills(rows, userId) {
    const occurrencesDelete = await supabase.from('fixed_bill_occurrences').delete().eq('user_id', userId);
    if (occurrencesDelete.error) throw occurrencesDelete.error;
    const billsDelete = await supabase.from('fixed_bills').delete().eq('user_id', userId);
    if (billsDelete.error) throw billsDelete.error;

    const bills = fixedBillRows(rows, userId);
    if (bills.length) {
      const billsInsert = await supabase.from('fixed_bills').insert(bills);
      if (billsInsert.error) throw billsInsert.error;
    }

    const occurrences = occurrenceRows(rows, userId);
    if (occurrences.length) {
      const occurrencesInsert = await supabase.from('fixed_bill_occurrences').insert(occurrences);
      if (occurrencesInsert.error) throw occurrencesInsert.error;
    }
  }

  async function migrateLocalDataToCloud() {
    if (!session?.user || !supabase) return;
    setCloudLoading(true);
    const snapshot = localMigrationSnapshot || loadData();
    await saveCloudData(session.user.id, snapshot);
    await loadCloudData(session.user.id);
    setSyncMessage('Migração concluída. O backup local foi mantido neste dispositivo.');
    setCloudLoading(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
    setCloudLoaded(false);
    setSyncMessage('Você saiu. Os dados locais continuam disponíveis neste dispositivo.');
  }

  function updateAccount(field, value) {
    setAccount((current) => ({ ...current, [field]: parseMoney(value) }));
  }

  function updateMonthRevenue(field, value) {
    setMonthlyRevenue((current) => ({
      ...current,
      [selectedMonth]: {
        ...defaultMonthlyRevenue(),
        ...(current[selectedMonth] || {}),
        [field]: parseMoney(value),
      },
    }));
  }

  function addFoodOutflow(event) {
    event.preventDefault();
    const value = parseMoney(foodOutflowForm.value);
    if (!foodOutflowForm.description.trim() || value <= 0) return;

    setMonthlyRevenue((current) => {
      const revenue = { ...defaultMonthlyRevenue(), ...(current[selectedMonth] || {}) };
      return {
        ...current,
        [selectedMonth]: {
          ...revenue,
          foodCardOutflows: [
            ...(revenue.foodCardOutflows || []),
            {
              id: uid(),
              date: foodOutflowForm.date || TODAY,
              description: foodOutflowForm.description.trim(),
              value,
              source: foodOutflowForm.source,
            },
          ],
        },
      };
    });
    setFoodOutflowForm({ date: TODAY, description: '', value: '', source: 'Alimentação Bruno' });
  }

  function removeFoodOutflow(id) {
    setMonthlyRevenue((current) => {
      const revenue = { ...defaultMonthlyRevenue(), ...(current[selectedMonth] || {}) };
      return {
        ...current,
        [selectedMonth]: {
          ...revenue,
          foodCardOutflows: revenue.foodCardOutflows.filter((outflow) => outflow.id !== id),
        },
      };
    });
  }

  function saveExpense(event) {
    event.preventDefault();
    const value = parseMoney(quickExpense.value);
    if (!quickExpense.description.trim() || value <= 0) return;

    const entry = {
      id: editingExpenseId || uid(),
      date: quickExpense.date || TODAY,
      month: monthFromDate(quickExpense.date || TODAY),
      type: quickExpense.type || 'Despesa',
      description: quickExpense.description.trim(),
      category: quickExpense.category || 'Outros',
      paymentMethod: normalizePaymentMethod(quickExpense.paymentMethod),
      value,
      status: quickExpense.status || 'Pago',
      note: quickExpense.note || '',
    };

    setEntries((current) => (editingExpenseId ? current.map((item) => (item.id === editingExpenseId ? entry : item)) : [entry, ...current]));
    setEditingExpenseId(null);
    setQuickExpense({ date: TODAY, description: '', value: '', category: 'Outros', paymentMethod: 'Pix', status: 'Pago', note: '', type: 'Despesa' });
  }

  function editExpense(entry) {
    setEditingExpenseId(entry.id);
    setQuickExpense({ ...entry, value: String(entry.value).replace('.', ',') });
    setActiveView('gastos');
  }

  function deleteExpense(id) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (editingExpenseId === id) {
      setEditingExpenseId(null);
      setQuickExpense({ date: TODAY, description: '', value: '', category: 'Outros', paymentMethod: 'Pix', status: 'Pago', note: '', type: 'Despesa' });
    }
  }

  function addFixedBill(event) {
    event.preventDefault();
    const value = parseMoney(billForm.value);
    if (!billForm.name.trim() || value <= 0) return;

    setFixedBills((current) => [
      ...current,
      {
        id: uid(),
        name: billForm.name.trim(),
        value,
        dueDay: Math.min(Math.max(Number(billForm.dueDay || 1), 1), 31),
        category: billForm.category || 'Outros',
        recurring: Boolean(billForm.recurring),
        active: Boolean(billForm.active),
        startMonth: selectedMonth,
        paidMonths: {},
      },
    ]);
    setBillForm({ name: '', value: '', dueDay: '10', category: 'Outros', recurring: true, active: true });
  }

  function setBillPaid(id, month, paid) {
    setFixedBills((current) =>
      current.map((bill) =>
        bill.id === id
          ? {
              ...bill,
              paidMonths: {
                ...bill.paidMonths,
                [month]: paid,
              },
            }
          : bill,
      ),
    );
  }

  function removeFixedBill(id) {
    setFixedBills((current) => current.filter((bill) => bill.id !== id));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ entries, fixedBills, account, planning, categories, monthlyRevenue, exportedAt: new Date().toISOString() }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-control-${selectedMonth}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importData(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const normalized = normalizeImportPayload(parsed);
        let ignored = 0;

        const entriesMerge = mergeUnique(entries, normalized.entries, (entry) => entry.id || `${entry.month}|${entry.date}|${entry.description}|${entry.value}|${entry.paymentMethod}`);
        ignored += entriesMerge.ignored;
        setEntries(entriesMerge.next);

        const billsMerge = mergeUnique(fixedBills, normalized.fixedBills, (bill) => bill.id || `${bill.startMonth}|${bill.name}|${bill.value}|${bill.dueDay}`);
        ignored += billsMerge.ignored;
        setFixedBills(billsMerge.next);

        if (normalized.account) setAccount((current) => ({ ...current, ...normalized.account }));
        if (Object.keys(normalized.planning).length) setPlanning((current) => ({ ...current, ...normalized.planning }));
        if (normalized.categories.length) setCategories((current) => Array.from(new Set([...current, ...normalized.categories])));
        if (Object.keys(normalized.monthlyRevenue).length) {
          setMonthlyRevenue((current) => ({ ...current, ...normalized.monthlyRevenue }));
        }

        setImportMessage(
          `Importação concluída: ${entriesMerge.added} gastos, ${billsMerge.added} contas, ${Object.keys(normalized.monthlyRevenue).length} mês(es) de receita. ${ignored} item(ns) ignorado(s) por duplicidade.`,
        );
      } catch (error) {
        setImportMessage(`Não foi possível importar o JSON: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function clearLocalData() {
    const confirmed = window.confirm('Isso limpa apenas o localStorage deste dispositivo. Dados no Supabase não serão apagados. Continuar?');
    if (!confirmed) return;
    localStorage.removeItem(STORAGE_KEY);
    setImportMessage('Dados locais limpos. Atualize a página para iniciar com estado vazio ou carregar da nuvem.');
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-white/80 bg-white/80 px-5 py-6 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:block">
        <Brand selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} session={session} />
        <Navigation activeView={activeView} setActiveView={setActiveView} />
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-white/70 bg-[#f5f5f7]/85 px-4 py-3 backdrop-blur-xl md:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <BrandCompact />
            <MonthSelector selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />
          </div>
          <div className="mt-3">
            <Navigation activeView={activeView} setActiveView={setActiveView} compact />
          </div>
        </header>

        <div className="space-y-7 px-4 py-6 md:px-8 lg:py-8">
          <PageTitle activeView={activeView} selectedMonth={selectedMonth} session={session} syncMessage={syncMessage} />

          {activeView === 'dashboard' && <Dashboard stats={monthStats} selectedMonth={selectedMonth} />}
          {activeView === 'receita' && (
            <Revenue
              selectedMonth={selectedMonth}
              revenue={monthStats.revenue}
              account={account}
              stats={monthStats}
              updateMonthRevenue={updateMonthRevenue}
              updateAccount={updateAccount}
              foodOutflowForm={foodOutflowForm}
              setFoodOutflowForm={setFoodOutflowForm}
              addFoodOutflow={addFoodOutflow}
              removeFoodOutflow={removeFoodOutflow}
            />
          )}
          {activeView === 'gastos' && (
            <Expenses
              stats={monthStats}
              quickExpense={quickExpense}
              setQuickExpense={setQuickExpense}
              saveExpense={saveExpense}
              editingExpenseId={editingExpenseId}
              setEditingExpenseId={setEditingExpenseId}
              setShowAdvanced={setShowAdvanced}
              showAdvanced={showAdvanced}
              categories={categories}
              filters={expenseFilters}
              setFilters={setExpenseFilters}
              expenses={filteredExpenses}
              editExpense={editExpense}
              deleteExpense={deleteExpense}
            />
          )}
          {activeView === 'contas' && (
            <Bills
              selectedMonth={selectedMonth}
              stats={monthStats}
              billForm={billForm}
              setBillForm={setBillForm}
              addFixedBill={addFixedBill}
              categories={categories}
              setBillPaid={setBillPaid}
              removeFixedBill={removeFixedBill}
            />
          )}
          {activeView === 'login' && (
            <AuthPanel
              session={session}
              authLoading={authLoading}
              cloudLoading={cloudLoading}
              authMessage={authMessage}
              setAuthMessage={setAuthMessage}
              syncMessage={syncMessage}
              migrateLocalDataToCloud={migrateLocalDataToCloud}
              signOut={signOut}
            />
          )}
          {activeView === 'configuracoes' && (
            <SettingsPanel
              session={session}
              syncMessage={syncMessage}
              importMessage={importMessage}
              exportData={exportData}
              importData={importData}
              clearLocalData={clearLocalData}
              fileInputRef={fileInputRef}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Brand({ selectedMonth, setSelectedMonth, session }) {
  return (
    <div className="mb-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-900/10">
          <CircleDollarSign size={23} />
        </div>
        <div>
          <p className="text-lg font-semibold tracking-tight">Finance Control</p>
          <p className="text-sm text-slate-500">{session?.user ? 'Nuvem sincronizada' : 'Local neste dispositivo'}</p>
        </div>
      </div>
      <MonthSelector selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} />
    </div>
  );
}

function BrandCompact() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white">
        <CircleDollarSign size={20} />
      </div>
      <div>
        <p className="font-semibold tracking-tight">Finance Control</p>
        <p className="text-xs text-slate-500">Painel mensal</p>
      </div>
    </div>
  );
}

function MonthSelector({ selectedMonth, setSelectedMonth }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-white bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm">
      <CalendarDays size={17} className="text-slate-400" />
      <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="max-w-32 bg-transparent outline-none" />
    </label>
  );
}

function Navigation({ activeView, setActiveView, compact = false }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'receita', label: 'Receita', icon: ArrowUpCircle },
    { id: 'gastos', label: 'Gastos', icon: CreditCard },
    { id: 'contas', label: 'Contas', icon: ListChecks },
    { id: 'login', label: 'Login', icon: User },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  return (
    <nav className={compact ? 'flex gap-2 overflow-x-auto pb-1' : 'space-y-2'}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              active ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/10' : 'text-slate-500 hover:bg-white hover:text-slate-950'
            } ${compact ? 'shrink-0' : 'w-full'}`}
          >
            <Icon size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function PageTitle({ activeView, selectedMonth, session, syncMessage }) {
  const titles = {
    dashboard: 'Dashboard',
    receita: 'Receita',
    gastos: 'Gastos',
    contas: 'Contas',
    login: 'Login',
    configuracoes: 'Configurações',
  };

  return (
    <section className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-medium capitalize text-slate-500">{monthLabel(selectedMonth)}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">{titles[activeView]}</h1>
      </div>
      <p className="max-w-xl text-sm text-slate-500">
        {session?.user ? `Conectado como ${session.user.email}. ${syncMessage || 'Sincronização ativa.'}` : 'Dados salvos apenas neste dispositivo. Faça login para sincronizar.'}
      </p>
    </section>
  );
}

function Dashboard({ stats, selectedMonth }) {
  const billChart = [
    { name: 'Pagas', value: stats.paidBills },
    { name: 'Pendentes', value: stats.pendingBills },
  ];

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard title="Receita" value={money(stats.cashRevenue)} detail={`Alimentação: ${money(stats.foodRevenue)}`} icon={ArrowUpCircle} tone="green" />
        <SummaryCard title="Gastos" value={money(sumBy(stats.paidExpenses))} detail={`Dinheiro: ${money(stats.cashExpenses)} | Alimentação: ${money(stats.foodExpenses)}`} icon={ArrowDownCircle} tone="red" />
        <SummaryCard title="Contas" value={money(stats.billsTotal)} detail={`${money(stats.paidBills)} pagas | ${money(stats.pendingBills)} pendentes`} icon={ReceiptText} tone="amber" />
        <SummaryCard title="Saldo atual" value={money(stats.accountBalance)} detail="Informado manualmente" icon={Wallet} tone="slate" />
        <SummaryCard title="Sobra prevista" value={money(stats.cashForecast)} detail="Receita em dinheiro - contas - gastos em dinheiro" icon={PiggyBank} tone={stats.cashForecast >= 0 ? 'green' : 'red'} />
        <SummaryCard title="Alimentação" value={money(stats.foodBalance)} detail={`${money(stats.foodExpenses + stats.foodOutflows)} usado/retirado`} icon={WalletCards} tone={stats.foodBalance >= 0 ? 'blue' : 'red'} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel title="Leitura do mês" subtitle={`Somente dados de ${selectedMonth}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniRow label="Receita em dinheiro" value={money(stats.cashRevenue)} positive />
            <MiniRow label="Receita alimentação" value={money(stats.foodRevenue)} positive />
            <MiniRow label="Gastos em dinheiro" value={money(stats.cashExpenses)} />
            <MiniRow label="Gastos alimentação" value={money(stats.foodExpenses)} />
            <MiniRow label="Contas pagas" value={money(stats.paidBills)} positive />
            <MiniRow label="Contas pendentes" value={money(stats.pendingBills)} />
          </div>
        </Panel>

        <Panel title="Contas pagas vs pendentes" subtitle="Status das contas do mês">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={billChart} dataKey="value" nameKey="name" innerRadius={54} outerRadius={84} paddingAngle={4}>
                {billChart.map((_, index) => (
                  <Cell key={index} fill={index === 0 ? '#16a34a' : '#f59e0b'} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => money(value)} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Gastos por forma de pagamento" subtitle="Alimentação fica separada da sobra em dinheiro">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.byPayment}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
              <Tooltip formatter={(value) => money(value)} />
              <Bar dataKey="value" fill="#111827" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Gastos por categoria" subtitle={stats.largestCategory ? `Maior categoria: ${stats.largestCategory.name}` : 'Sem gastos no mês'}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={stats.byCategory} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
                {stats.byCategory.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => money(value)} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </section>
    </div>
  );
}

function Revenue({ selectedMonth, revenue, account, stats, updateMonthRevenue, updateAccount, foodOutflowForm, setFoodOutflowForm, addFoodOutflow, removeFoodOutflow }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Panel title="Receitas do mês" subtitle="Dinheiro e cartão alimentação são separados">
        <div className="grid gap-4">
          <MoneyField label="Saldo atual da conta" value={account.currentBalance} onChange={(value) => updateAccount('currentBalance', value)} />
          <MoneyField label="Salário Bruno" value={revenue.brunoSalary} onChange={(value) => updateMonthRevenue('brunoSalary', value)} />
          <MoneyField label="Salário Mariah" value={revenue.mariahSalary} onChange={(value) => updateMonthRevenue('mariahSalary', value)} />
          <MoneyField label="Renda extra" value={revenue.extraIncome} onChange={(value) => updateMonthRevenue('extraIncome', value)} />
          <MoneyField label="Outros valores" value={revenue.otherIncome} onChange={(value) => updateMonthRevenue('otherIncome', value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField label="Alimentação Bruno" value={revenue.brunoFoodCard} onChange={(value) => updateMonthRevenue('brunoFoodCard', value)} />
            <MoneyField label="Alimentação Mariah" value={revenue.mariahFoodCard} onChange={(value) => updateMonthRevenue('mariahFoodCard', value)} />
          </div>
        </div>
      </Panel>

      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Receita dinheiro" value={money(stats.cashRevenue)} detail={selectedMonth} icon={CircleDollarSign} tone="green" compact />
          <SummaryCard title="Receita alimentação" value={money(stats.foodRevenue)} detail="Cartões" icon={WalletCards} tone="blue" compact />
          <SummaryCard title="Alimentação usado" value={money(stats.foodExpenses + stats.foodOutflows)} detail="Gastos + saídas" icon={ArrowDownCircle} tone="amber" compact />
          <SummaryCard title="Saldo alimentação" value={money(stats.foodBalance)} detail="Disponível" icon={PiggyBank} tone={stats.foodBalance >= 0 ? 'green' : 'red'} compact />
        </section>

        <Panel title="Saídas do alimentação" subtitle="Registre valores entregues ou retirados do cartão">
          <form onSubmit={addFoodOutflow} className="grid gap-3 md:grid-cols-[150px_1fr_140px_190px_auto]">
            <input type="date" value={foodOutflowForm.date} onChange={(event) => setFoodOutflowForm({ ...foodOutflowForm, date: event.target.value })} className="input" />
            <input value={foodOutflowForm.description} onChange={(event) => setFoodOutflowForm({ ...foodOutflowForm, description: event.target.value })} className="input" placeholder="Descrição" />
            <input inputMode="decimal" value={foodOutflowForm.value} onChange={(event) => setFoodOutflowForm({ ...foodOutflowForm, value: event.target.value })} className="input" placeholder="Valor" />
            <select value={foodOutflowForm.source} onChange={(event) => setFoodOutflowForm({ ...foodOutflowForm, source: event.target.value })} className="input">
              <option>Alimentação Bruno</option>
              <option>Alimentação Mariah</option>
              <option>Outro</option>
            </select>
            <button className="btn-primary">
              <Plus size={17} /> Adicionar
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {(revenue.foodCardOutflows || []).map((outflow) => (
              <ListItem key={outflow.id}>
                <div>
                  <p className="font-semibold">{outflow.description}</p>
                  <p className="text-sm text-slate-500">{outflow.date.split('-').reverse().join('/')} - {outflow.source}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-semibold">{money(outflow.value)}</p>
                  <IconButton label="Excluir" onClick={() => removeFoodOutflow(outflow.id)} danger>
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              </ListItem>
            ))}
            {!revenue.foodCardOutflows?.length && <EmptyState text="Nenhuma saída manual de alimentação neste mês." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Expenses({
  stats,
  quickExpense,
  setQuickExpense,
  saveExpense,
  editingExpenseId,
  setEditingExpenseId,
  showAdvanced,
  setShowAdvanced,
  categories,
  filters,
  setFilters,
  expenses,
  editExpense,
  deleteExpense,
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Panel title={editingExpenseId ? 'Editar gasto' : 'Cadastro rápido'} subtitle="Campos principais para uso diário">
        <form onSubmit={saveExpense} className="grid gap-4">
          <Field label="Data">
            <input type="date" value={quickExpense.date} onChange={(event) => setQuickExpense({ ...quickExpense, date: event.target.value })} className="input" />
          </Field>
          <Field label="Descrição">
            <input value={quickExpense.description} onChange={(event) => setQuickExpense({ ...quickExpense, description: event.target.value })} className="input" required />
          </Field>
          <MoneyField label="Valor" value={quickExpense.value} onChange={(value) => setQuickExpense({ ...quickExpense, value })} raw />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Categoria" value={quickExpense.category} options={categories} onChange={(value) => setQuickExpense({ ...quickExpense, category: value })} />
            <Select label="Forma de pagamento" value={quickExpense.paymentMethod} options={PAYMENT_METHODS} onChange={(value) => setQuickExpense({ ...quickExpense, paymentMethod: value })} />
          </div>

          <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="btn-secondary justify-between">
            Opções avançadas <ChevronDown className={showAdvanced ? 'rotate-180 transition' : 'transition'} size={18} />
          </button>
          {showAdvanced && (
            <div className="grid gap-4 rounded-3xl bg-slate-50 p-4">
              <Select label="Status" value={quickExpense.status} options={STATUSES} onChange={(value) => setQuickExpense({ ...quickExpense, status: value })} />
              <Select label="Tipo" value={quickExpense.type} options={TYPES} onChange={(value) => setQuickExpense({ ...quickExpense, type: value })} />
              <Field label="Observação">
                <textarea value={quickExpense.note} onChange={(event) => setQuickExpense({ ...quickExpense, note: event.target.value })} className="input min-h-24 resize-y" />
              </Field>
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-primary flex-1">
              <Plus size={17} /> {editingExpenseId ? 'Salvar alteração' : 'Salvar gasto'}
            </button>
            {editingExpenseId && (
              <button
                type="button"
                onClick={() => {
                  setEditingExpenseId(null);
                  setQuickExpense({ date: TODAY, description: '', value: '', category: 'Outros', paymentMethod: 'Pix', status: 'Pago', note: '', type: 'Despesa' });
                }}
                className="btn-secondary"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </Panel>

      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-3">
          <SummaryCard title="Total gasto" value={money(sumBy(stats.paidExpenses))} detail={`${stats.expenses.length} lançamentos`} icon={CreditCard} tone="slate" compact />
          <SummaryCard title="Crédito" value={money(sumBy(stats.paidExpenses, (entry) => entry.paymentMethod === 'Crédito'))} detail="Pago no crédito" icon={CreditCard} tone="blue" compact />
          <SummaryCard title="Alimentação" value={money(stats.foodExpenses)} detail="Não reduz dinheiro livre" icon={WalletCards} tone="green" compact />
          <SummaryCard title="Débito" value={money(sumBy(stats.paidExpenses, (entry) => entry.paymentMethod === 'Débito'))} detail="Conta corrente" icon={Wallet} tone="slate" compact />
          <SummaryCard title="Pix" value={money(sumBy(stats.paidExpenses, (entry) => entry.paymentMethod === 'Pix'))} detail="Conta corrente" icon={CircleDollarSign} tone="slate" compact />
          <SummaryCard title="Maior categoria" value={stats.largestCategory?.name || 'Sem dados'} detail={stats.largestCategory ? money(stats.largestCategory.value) : 'Nenhum gasto'} icon={ReceiptText} tone="amber" compact />
        </section>

        <Panel title="Lançamentos do mês" subtitle="Lista limpa, sem aparência de planilha">
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <FilterSelect value={filters.category} options={categories} placeholder="Todas as categorias" onChange={(value) => setFilters({ ...filters, category: value })} />
            <FilterSelect value={filters.paymentMethod} options={PAYMENT_METHODS} placeholder="Todas as formas" onChange={(value) => setFilters({ ...filters, paymentMethod: value })} />
          </div>

          <div className="space-y-3">
            {expenses.map((entry) => (
              <ListItem key={entry.id}>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{entry.description}</p>
                  <p className="text-sm text-slate-500">{entry.date.split('-').reverse().join('/')} - {entry.category} - {entry.paymentMethod}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="font-semibold">{money(entry.value)}</p>
                  <IconButton label="Editar" onClick={() => editExpense(entry)}>
                    <Check size={17} />
                  </IconButton>
                  <IconButton label="Excluir" onClick={() => deleteExpense(entry.id)} danger>
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              </ListItem>
            ))}
            {!expenses.length && <EmptyState text="Nenhum gasto encontrado para este mês." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Bills({ selectedMonth, stats, billForm, setBillForm, addFixedBill, categories, setBillPaid, removeFixedBill }) {
  const commitment = stats.cashRevenue > 0 ? (stats.billsTotal / stats.cashRevenue) * 100 : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
      <Panel title="Nova conta" subtitle="Cadastre contas fixas ou pontuais">
        <form onSubmit={addFixedBill} className="grid gap-4">
          <Field label="Nome da conta">
            <input value={billForm.name} onChange={(event) => setBillForm({ ...billForm, name: event.target.value })} className="input" required />
          </Field>
          <MoneyField label="Valor" value={billForm.value} onChange={(value) => setBillForm({ ...billForm, value })} raw />
          <Field label="Dia de vencimento">
            <input type="number" min="1" max="31" value={billForm.dueDay} onChange={(event) => setBillForm({ ...billForm, dueDay: event.target.value })} className="input" />
          </Field>
          <Select label="Categoria" value={billForm.category} options={categories} onChange={(value) => setBillForm({ ...billForm, category: value })} />
          <div className="grid grid-cols-2 gap-3">
            <Toggle label="Recorrente" checked={billForm.recurring} onChange={(checked) => setBillForm({ ...billForm, recurring: checked })} />
            <Toggle label="Ativa" checked={billForm.active} onChange={(checked) => setBillForm({ ...billForm, active: checked })} />
          </div>
          <button className="btn-primary">
            <Plus size={17} /> Adicionar conta
          </button>
        </form>
      </Panel>

      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard title="Receita dinheiro" value={money(stats.cashRevenue)} detail="Sem alimentação" icon={CircleDollarSign} tone="green" compact />
          <SummaryCard title="Total em contas" value={money(stats.billsTotal)} detail={`${commitment.toFixed(1)}% da receita`} icon={ReceiptText} tone="amber" compact />
          <SummaryCard title="Pagas" value={money(stats.paidBills)} detail="Contas quitadas" icon={CheckCircle2} tone="green" compact />
          <SummaryCard title="Pendentes" value={money(stats.pendingBills)} detail="Ainda em aberto" icon={AlertCircle} tone="red" compact />
          <SummaryCard title="Sobra após contas" value={money(stats.cashRevenue - stats.billsTotal)} detail="Receita dinheiro - contas" icon={PiggyBank} tone={stats.cashRevenue - stats.billsTotal >= 0 ? 'green' : 'red'} compact />
          <SummaryCard title="Comprometido" value={`${commitment.toFixed(1)}%`} detail="Receita com contas" icon={Wallet} tone={commitment > 80 ? 'red' : 'slate'} compact />
        </section>

        <Panel title="Contas do mês" subtitle="Marque pago ou pendente com um clique">
          <div className="space-y-3">
            {stats.bills.map((bill) => (
              <ListItem key={bill.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{bill.name}</p>
                    <BillStatusBadge bill={bill} />
                  </div>
                  <p className="text-sm text-slate-500">Dia {bill.dueDay} - {bill.category}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <p className="mr-1 font-semibold">{money(bill.value)}</p>
                  <button onClick={() => setBillPaid(bill.id, selectedMonth, true)} className="btn-mini bg-emerald-50 text-emerald-700">
                    Paga
                  </button>
                  <button onClick={() => setBillPaid(bill.id, selectedMonth, false)} className="btn-mini bg-amber-50 text-amber-700">
                    Pendente
                  </button>
                  <IconButton label="Excluir" onClick={() => removeFixedBill(bill.id)} danger>
                    <Trash2 size={17} />
                  </IconButton>
                </div>
              </ListItem>
            ))}
            {!stats.bills.length && <EmptyState text="Nenhuma conta cadastrada para este mês." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AuthPanel({ session, authLoading, cloudLoading, authMessage, setAuthMessage, syncMessage, migrateLocalDataToCloud, signOut }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitAuth(event) {
    event.preventDefault();
    setSubmitting(true);
    setAuthMessage('');

    try {
      if (!supabase) {
        setAuthMessage('Supabase ainda não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
        return;
      }

      const authCall = mode === 'signup' ? supabase.auth.signUp({ email, password }) : supabase.auth.signInWithPassword({ email, password });
      const { error } = await authCall;
      if (error) throw error;
      setAuthMessage(mode === 'signup' ? 'Conta criada. Confirme o e-mail se o Supabase solicitar.' : 'Login realizado.');
    } catch (error) {
      setAuthMessage(error.message || 'Não foi possível autenticar. Confira e-mail e senha.');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <Panel title="Login e sincronização" subtitle="Carregando sessão">
        <p className="text-sm text-slate-500">Aguarde...</p>
      </Panel>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <Panel title="Login e sincronização" subtitle="Supabase não configurado">
        <p className="text-sm text-slate-500">O app continua funcionando com localStorage. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ativar login e nuvem.</p>
      </Panel>
    );
  }

  if (session?.user) {
    return (
      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Panel title="Conta conectada" subtitle={session.user.email}>
          <div className="space-y-3">
            <button onClick={migrateLocalDataToCloud} disabled={cloudLoading} className="btn-primary w-full">
              <Upload size={18} /> Migrar dados locais para minha conta
            </button>
            <button onClick={signOut} className="btn-secondary w-full">
              <LogOut size={18} /> Sair
            </button>
          </div>
        </Panel>
        <Panel title="Sincronização" subtitle="Supabase + backup local">
          <p className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">{syncMessage || 'Aguardando alterações.'}</p>
        </Panel>
      </section>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <Panel title={mode === 'login' ? 'Entrar' : 'Criar conta'} subtitle="Login separado do painel principal">
        <form onSubmit={submitAuth} className="grid gap-4">
          <Field label="E-mail">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" required />
          </Field>
          <Field label="Senha">
            <input type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} className="input" required />
          </Field>
          {authMessage && <div className="rounded-3xl bg-amber-50 p-3 text-sm text-amber-800">{authMessage}</div>}
          <button disabled={submitting} className="btn-primary">
            <User size={18} /> {submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setAuthMessage('');
            }}
            className="text-sm font-semibold text-slate-600 hover:text-slate-950"
          >
            {mode === 'login' ? 'Criar uma nova conta' : 'Já tenho conta'}
          </button>
        </form>
      </Panel>
      <Panel title="Modo sem login" subtitle="Fallback local preservado">
        <p className="text-sm text-slate-500">Sem login, os dados continuam salvos neste dispositivo via localStorage. Ao entrar, você pode migrar o backup local para a sua conta.</p>
      </Panel>
    </section>
  );
}

function SettingsPanel({ session, syncMessage, importMessage, exportData, importData, clearLocalData, fileInputRef }) {
  return (
    <section className="grid gap-5 xl:grid-cols-3">
      <Panel title="Backup" subtitle="Importação e exportação JSON">
        <div className="space-y-3">
          <button onClick={exportData} className="btn-primary w-full">
            <Download size={18} /> Exportar dados
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full">
            <Upload size={18} /> Importar JSON
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" onChange={importData} className="hidden" />
          {importMessage && <p className="rounded-3xl bg-slate-50 p-3 text-sm text-slate-600">{importMessage}</p>}
        </div>
      </Panel>

      <Panel title="Armazenamento" subtitle="Local e nuvem">
        <div className="space-y-3">
          <MiniRow label="Modo atual" value={session?.user ? 'Supabase + localStorage' : 'localStorage'} positive={Boolean(session?.user)} />
          <MiniRow label="Usuário" value={session?.user?.email || 'Sem login'} />
          <p className="rounded-3xl bg-slate-50 p-3 text-sm text-slate-600">{syncMessage || 'Sem sincronização em andamento.'}</p>
        </div>
      </Panel>

      <Panel title="Segurança" subtitle="Dados financeiros pessoais">
        <div className="space-y-3 text-sm text-slate-600">
          <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-emerald-700" /> Não compartilhe arquivos JSON exportados se contiverem dados pessoais.</p>
          <p>O botão abaixo limpa apenas este dispositivo. Use com cuidado.</p>
          <button onClick={clearLocalData} className="btn-secondary w-full text-rose-700">
            <Trash2 size={18} /> Limpar dados locais
          </button>
        </div>
      </Panel>
    </section>
  );
}

function SummaryCard({ title, value, detail, icon: Icon, tone = 'slate', compact = false }) {
  const toneClass = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <article className={`rounded-[28px] border border-white bg-white/90 shadow-[0_20px_70px_rgba(15,23,42,0.06)] ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`${compact ? 'text-xl' : 'text-2xl'} mt-2 truncate font-semibold tracking-tight text-slate-950`}>{value}</p>
          {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
        </div>
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${toneClass}`}>
          <Icon size={21} />
        </div>
      </div>
    </article>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <article className="rounded-[30px] border border-white bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.06)] md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </article>
  );
}

function ListItem({ children }) {
  return <div className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">{children}</div>;
}

function BillStatusBadge({ bill }) {
  const status = statusForDueDate(bill.dueDate, bill.status === 'Pago');
  const Icon = status.icon;
  const className = {
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
  }[status.tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      <Icon size={14} /> {status.label}
    </span>
  );
}

function MoneyField({ label, value, onChange, raw = false }) {
  return (
    <Field label={label}>
      <input inputMode="decimal" value={raw ? value : value || ''} onChange={(event) => onChange(event.target.value)} className="input" placeholder="0,00" />
    </Field>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

function FilterSelect({ value, options, placeholder, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="input">
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-sm font-semibold">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-slate-950" />
    </label>
  );
}

function MiniRow({ label, value, positive = false }) {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-slate-100 bg-white px-4 py-3">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`font-semibold ${positive ? 'text-emerald-700' : 'text-slate-950'}`}>{value}</span>
    </div>
  );
}

function IconButton({ label, onClick, danger = false, children }) {
  return (
    <button onClick={onClick} className={`grid h-10 w-10 place-items-center rounded-2xl border border-slate-100 bg-white ${danger ? 'text-rose-700' : 'text-slate-600'}`} title={label}>
      {children}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-sm text-slate-500">{text}</div>;
}

export default App;
