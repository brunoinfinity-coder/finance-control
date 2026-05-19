import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
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
  ArrowUpCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  Upload,
  User,
  Wallet,
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

const PAYMENT_METHODS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Boleto'];
const TYPES = ['Receita', 'Conta', 'Despesa', 'Dívida', 'Investimento'];
const STATUSES = ['Pago', 'Pendente', 'Planejado'];
const EXPENSE_TYPES = ['Conta', 'Despesa', 'Dívida', 'Investimento'];
const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0f766e', '#db2777'];

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
  return date?.slice(0, 7) || CURRENT_MONTH;
}

function nextMonth(month) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateFromMonthDay(month, day) {
  const [year, monthIndex] = month.split('-').map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${month}-${String(Math.min(Number(day), lastDay)).padStart(2, '0')}`;
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

function defaultAccount() {
  return {
    currentBalance: 0,
    currentIncomeExpected: 0,
    nextIncomeExpected: 0,
    previousBalance: 0,
    minimumReserve: 0,
  };
}

function normalizeEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    id: entry.id || uid(),
    date: entry.date || TODAY,
    month: entry.month || monthFromDate(entry.date || TODAY),
    type: entry.type || 'Despesa',
    description: entry.description || 'Lançamento',
    category: entry.category || 'Outros',
    paymentMethod: entry.paymentMethod || 'Pix',
    value: Number(entry.value || 0),
    status: entry.status || 'Pago',
    note: entry.note || '',
  }));
}

function normalizeFixedBills(fixedBills) {
  return (Array.isArray(fixedBills) ? fixedBills : []).map((bill) => ({
    id: bill.id || uid(),
    name: bill.name || 'Conta fixa',
    value: Number(bill.value || 0),
    dueDay: Number(bill.dueDay || 1),
    category: bill.category || 'Outros',
    recurring: bill.recurring !== false,
    active: bill.active !== false,
    startMonth: bill.startMonth || CURRENT_MONTH,
    paidMonths: bill.paidMonths && typeof bill.paidMonths === 'object' ? bill.paidMonths : {},
  }));
}

function loadData() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const planning = parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : {};
    const account = { ...defaultAccount(), ...(parsed.account || {}) };
    const next = nextMonth(CURRENT_MONTH);

    return {
      entries: normalizeEntries(parsed.entries),
      fixedBills: normalizeFixedBills(parsed.fixedBills),
      account,
      planning: {
        [CURRENT_MONTH]: { ...defaultPlanning(CURRENT_MONTH), ...(planning[CURRENT_MONTH] || {}), renda: planning[CURRENT_MONTH]?.renda || account.currentIncomeExpected || 0 },
        [next]: { ...defaultPlanning(next), ...(planning[next] || {}), renda: planning[next]?.renda || account.nextIncomeExpected || 0 },
        ...planning,
      },
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
    };
  } catch {
    return {
      entries: [],
      fixedBills: [],
      account: defaultAccount(),
      planning: { [CURRENT_MONTH]: defaultPlanning(CURRENT_MONTH), [nextMonth(CURRENT_MONTH)]: defaultPlanning(nextMonth(CURRENT_MONTH)) },
      categories: DEFAULT_CATEGORIES,
    };
  }
}

function localSnapshotFromState({ entries, fixedBills, account, planning, categories }) {
  return { entries, fixedBills, account, planning, categories };
}

function splitMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return { year, monthNumber };
}

function joinMonth(year, monthNumber) {
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
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

function categoryRows(categories, userId) {
  return categories.map((name) => ({ user_id: userId, name }));
}

function buildStateFromCloud({ settings, fixedBillsRows, occurrenceRowsData, entriesRows, planningRowsData, categoriesRows }) {
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
    paymentMethod: entry.payment_method || 'Pix',
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

  const categories = categoriesRows.length ? categoriesRows.map((category) => category.name) : DEFAULT_CATEGORIES;

  return {
    entries: normalizeEntries(entries),
    fixedBills: normalizeFixedBills(fixedBills),
    account: { ...defaultAccount(), ...accountFromSettings(settings) },
    planning: Object.keys(planning).length ? planning : { [CURRENT_MONTH]: defaultPlanning(CURRENT_MONTH), [nextMonth(CURRENT_MONTH)]: defaultPlanning(nextMonth(CURRENT_MONTH)) },
    categories,
  };
}

function sumBy(items, predicate) {
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
  if (diffDays === 0) return { label: 'Vence hoje', tone: 'amber', icon: Clock3 };
  if (diffDays <= 7) return { label: `${diffDays} dia(s)`, tone: 'amber', icon: Clock3 };
  return { label: 'Futura', tone: 'slate', icon: CalendarDays };
}

function App() {
  const initialData = useMemo(loadData, []);
  const [entries, setEntries] = useState(initialData.entries);
  const [fixedBills, setFixedBills] = useState(initialData.fixedBills);
  const [account, setAccount] = useState(initialData.account);
  const [planning, setPlanning] = useState(initialData.planning);
  const [categories, setCategories] = useState(initialData.categories);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [activeView, setActiveView] = useState('dashboard');
  const [quickExpense, setQuickExpense] = useState({
    description: '',
    value: '',
    category: 'Outros',
    paymentMethod: 'Pix',
    date: TODAY,
    type: 'Despesa',
    status: 'Pago',
    note: '',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [billForm, setBillForm] = useState({
    name: '',
    value: '',
    dueDay: '10',
    category: 'Outros',
    recurring: true,
    active: true,
  });
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudLoaded, setCloudLoaded] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [localMigrationSnapshot, setLocalMigrationSnapshot] = useState(null);
  const fileInputRef = useRef(null);

  const currentMonth = selectedMonth;
  const plannedNextMonth = nextMonth(currentMonth);
  const monthPlanning = { ...defaultPlanning(currentMonth), ...(planning[currentMonth] || {}) };
  const nextPlanning = { ...defaultPlanning(plannedNextMonth), ...(planning[plannedNextMonth] || {}) };
  const monthEntries = entries.filter((entry) => entry.month === currentMonth);
  const currentBills = fixedBillInstances(fixedBills, currentMonth);
  const nextBills = fixedBillInstances(fixedBills, plannedNextMonth);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, fixedBills, account, planning, categories }));
  }, [entries, fixedBills, account, planning, categories]);

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
      saveCloudData(session.user.id, localSnapshotFromState({ entries, fixedBills, account, planning, categories }));
    }, CLOUD_SAVE_DELAY);

    return () => window.clearTimeout(timeout);
  }, [account, categories, cloudLoaded, entries, fixedBills, planning, session?.user?.id]);

  const forecasts = useMemo(() => {
    const paidEntries = sumBy(monthEntries, (entry) => entry.status === 'Pago' && EXPENSE_TYPES.includes(entry.type));
    const pendingEntries = sumBy(monthEntries, (entry) => entry.status !== 'Pago' && EXPENSE_TYPES.includes(entry.type));
    const paidBills = sumBy(currentBills, (bill) => bill.status === 'Pago');
    const pendingBills = sumBy(currentBills, (bill) => bill.status !== 'Pago');
    const incomeReceived = sumBy(monthEntries, (entry) => entry.status === 'Pago' && entry.type === 'Receita');
    const incomeExpected = Number(account.currentIncomeExpected || monthPlanning.renda || 0);
    const incomeStillExpected = Math.max(incomeExpected - incomeReceived, 0);
    const plannedVariableLeft = Math.max(Number(monthPlanning.despesas || 0) - sumBy(monthEntries, (entry) => entry.status === 'Pago' && entry.type === 'Despesa'), 0);
    const currentForecast = Number(account.currentBalance || 0) + incomeStillExpected - pendingBills - pendingEntries - plannedVariableLeft;
    const nextFixedBills = sumBy(nextBills, () => true);
    const nextIncome = Number(nextPlanning.renda || 0);
    const nextForecast =
      Number(account.currentBalance || 0) +
      nextIncome -
      nextFixedBills -
      Number(nextPlanning.despesas || 0) -
      Number(nextPlanning.dividas || 0) -
      Number(nextPlanning.investimentos || 0);

    return {
      paidTotal: paidEntries + paidBills,
      pendingTotal: pendingEntries + pendingBills,
      incomeExpected,
      incomeStillExpected,
      currentForecast,
      nextForecast,
      freeToSpend: currentForecast - Number(account.minimumReserve || nextPlanning.reserva || 0),
      nextIncome,
      nextFixedBills,
      nextOutflow: nextFixedBills + Number(nextPlanning.despesas || 0) + Number(nextPlanning.dividas || 0) + Number(nextPlanning.investimentos || 0),
    };
  }, [account, currentBills, monthEntries, monthPlanning, nextBills, nextPlanning]);

  const nextDueBills = useMemo(
    () => currentBills.filter((bill) => bill.status !== 'Pago').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [currentBills],
  );

  const chartData = useMemo(() => {
    const paidExpenses = monthEntries.filter((entry) => entry.status === 'Pago' && EXPENSE_TYPES.includes(entry.type));
    const byCategory = categories
      .map((category) => ({
        name: category,
        value:
          sumBy(paidExpenses, (entry) => entry.category === category) +
          sumBy(currentBills, (bill) => bill.status === 'Pago' && bill.category === category),
      }))
      .filter((item) => item.value > 0);
    const plannedVsDone = [
      { name: 'Pago', value: forecasts.paidTotal },
      { name: 'Pendente', value: forecasts.pendingTotal },
      { name: 'Livre', value: Math.max(forecasts.freeToSpend, 0) },
    ];
    const daily = monthEntries
      .filter((entry) => entry.status === 'Pago' && EXPENSE_TYPES.includes(entry.type))
      .reduce((items, entry) => {
        const day = entry.date.slice(8, 10);
        const found = items.find((item) => item.day === day);
        if (found) found.gasto += Number(entry.value || 0);
        else items.push({ day, gasto: Number(entry.value || 0) });
        return items;
      }, [])
      .sort((a, b) => a.day.localeCompare(b.day));

    return { byCategory, plannedVsDone, daily };
  }, [categories, currentBills, forecasts, monthEntries]);

  async function loadCloudData(userId) {
    setCloudLoading(true);
    setSyncMessage('Carregando dados da nuvem...');
    setLocalMigrationSnapshot((current) => current || loadData());

    try {
      const [settingsResult, fixedBillsResult, occurrencesResult, entriesResult, planningResult, categoriesResult] = await Promise.all([
        supabase.from('financial_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('fixed_bills').select('*').eq('user_id', userId).order('due_day'),
        supabase.from('fixed_bill_occurrences').select('*').eq('user_id', userId),
        supabase.from('quick_expenses').select('*').eq('user_id', userId).order('entry_date', { ascending: false }),
        supabase.from('monthly_planning').select('*').eq('user_id', userId),
        supabase.from('categories').select('*').eq('user_id', userId).order('name'),
      ]);

      const error = settingsResult.error || fixedBillsResult.error || occurrencesResult.error || entriesResult.error || planningResult.error || categoriesResult.error;
      if (error) throw error;

      const hasCloudData =
        settingsResult.data ||
        fixedBillsResult.data?.length ||
        occurrencesResult.data?.length ||
        entriesResult.data?.length ||
        planningResult.data?.length ||
        categoriesResult.data?.length;

      if (hasCloudData) {
        const cloudState = buildStateFromCloud({
          settings: settingsResult.data,
          fixedBillsRows: fixedBillsResult.data || [],
          occurrenceRowsData: occurrencesResult.data || [],
          entriesRows: entriesResult.data || [],
          planningRowsData: planningResult.data || [],
          categoriesRows: categoriesResult.data || [],
        });

        setEntries(cloudState.entries);
        setFixedBills(cloudState.fixedBills);
        setAccount(cloudState.account);
        setPlanning(cloudState.planning);
        setCategories(cloudState.categories);
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
    const numberValue = parseMoney(value);
    setAccount((current) => ({ ...current, [field]: numberValue }));
    if (field === 'currentIncomeExpected') updatePlanningValue(currentMonth, 'renda', numberValue);
    if (field === 'nextIncomeExpected') updatePlanningValue(plannedNextMonth, 'renda', numberValue);
  }

  function updatePlanningValue(month, field, value) {
    const numberValue = parseMoney(value);
    if (month === plannedNextMonth && field === 'renda') {
      setAccount((current) => ({ ...current, nextIncomeExpected: numberValue }));
    }
    setPlanning((current) => ({
      ...current,
      [month]: {
        ...defaultPlanning(month),
        ...(current[month] || {}),
        [field]: numberValue,
      },
    }));
  }

  function addQuickExpense(event) {
    event.preventDefault();
    const value = parseMoney(quickExpense.value);
    if (!quickExpense.description.trim() || value <= 0) return;

    const entry = {
      id: uid(),
      date: quickExpense.date || TODAY,
      month: monthFromDate(quickExpense.date || TODAY),
      type: quickExpense.type || 'Despesa',
      description: quickExpense.description.trim(),
      category: quickExpense.category || 'Outros',
      paymentMethod: quickExpense.paymentMethod || 'Pix',
      value,
      status: quickExpense.status || 'Pago',
      note: quickExpense.note || '',
    };

    setEntries((current) => [entry, ...current]);
    setQuickExpense((current) => ({ ...current, description: '', value: '', date: TODAY, type: 'Despesa', status: 'Pago', note: '' }));
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
        startMonth: currentMonth,
        paidMonths: {},
      },
    ]);
    setBillForm({ name: '', value: '', dueDay: '10', category: 'Outros', recurring: true, active: true });
  }

  function toggleBillPaid(id, month) {
    setFixedBills((current) =>
      current.map((bill) =>
        bill.id === id
          ? {
              ...bill,
              paidMonths: {
                ...bill.paidMonths,
                [month]: !bill.paidMonths?.[month],
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
    const blob = new Blob([JSON.stringify({ entries, fixedBills, account, planning, categories, exportedAt: new Date().toISOString() }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-control-${CURRENT_MONTH}.json`;
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
        setEntries(normalizeEntries(parsed.entries));
        setFixedBills(normalizeFixedBills(parsed.fixedBills));
        setAccount({ ...defaultAccount(), ...(parsed.account || {}) });
        setPlanning(parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : {});
        setCategories(Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES);
      } catch {
        alert('Arquivo JSON inválido.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  return (
    <div className="min-h-screen bg-surface text-ink">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-line bg-white px-5 py-6 lg:block">
        <Brand />
        <Navigation activeView={activeView} setActiveView={setActiveView} />
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">Fluxo simplificado</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Painel financeiro pessoal</h1>
              <p className="mt-1 text-sm text-slate-500">
                {session?.user
                  ? `Conectado como ${session.user.email}. ${syncMessage || 'Sincronização ativa.'}`
                  : 'Dados salvos apenas neste dispositivo. Faça login para sincronizar.'}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm">
                <CalendarDays size={18} className="text-slate-500" />
                <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="bg-transparent outline-none" />
              </label>
              <button onClick={exportData} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                <Download size={17} /> Exportar
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold"
              >
                <Upload size={17} /> Importar
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" onChange={importData} className="hidden" />
            </div>
          </div>
          <div className="mt-4 lg:hidden">
            <Navigation activeView={activeView} setActiveView={setActiveView} compact />
          </div>
        </header>

        <div className="space-y-6 px-4 py-6 md:px-8">
          {activeView === 'dashboard' && (
            <Dashboard
              account={account}
              forecasts={forecasts}
              nextDueBills={nextDueBills}
              currentBills={currentBills}
              chartData={chartData}
              selectedMonth={selectedMonth}
            />
          )}
          {activeView === 'saldo' && <Balance account={account} updateAccount={updateAccount} />}
          {activeView === 'contas' && (
            <FixedBills
              billForm={billForm}
              setBillForm={setBillForm}
              addFixedBill={addFixedBill}
              bills={currentBills}
              categories={categories}
              month={currentMonth}
              toggleBillPaid={toggleBillPaid}
              removeFixedBill={removeFixedBill}
            />
          )}
          {activeView === 'gastos' && (
            <QuickExpense
              quickExpense={quickExpense}
              setQuickExpense={setQuickExpense}
              addQuickExpense={addQuickExpense}
              categories={categories}
              showAdvanced={showAdvanced}
              setShowAdvanced={setShowAdvanced}
              recentEntries={entries.slice(0, 8)}
            />
          )}
          {activeView === 'planejamento' && (
            <NextMonthPlanning
              month={plannedNextMonth}
              account={account}
              nextPlanning={nextPlanning}
              forecasts={forecasts}
              updatePlanningValue={updatePlanningValue}
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
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="mb-8 flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-600 text-white">
        <CircleDollarSign size={24} />
      </div>
      <div>
        <p className="text-lg font-semibold">Finance Control</p>
        <p className="text-sm text-slate-500">Planejamento simples</p>
      </div>
    </div>
  );
}

function Navigation({ activeView, setActiveView, compact = false }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'saldo', label: 'Saldo e renda', icon: Wallet },
    { id: 'contas', label: 'Contas fixas', icon: ListChecks },
    { id: 'gastos', label: 'Gasto rápido', icon: CreditCard },
    { id: 'planejamento', label: 'Próximo mês', icon: Target },
    { id: 'login', label: 'Login', icon: User },
  ];

  return (
    <nav className={compact ? 'flex gap-2 overflow-x-auto' : 'space-y-2'}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeView === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition ${
              active ? 'bg-emerald-600 text-white shadow-soft' : 'text-slate-600 hover:bg-slate-100'
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

      const authCall =
        mode === 'signup'
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });
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
      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Carregando sessão...</p>
      </section>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Login e sincronização</h2>
        <p className="mt-2 text-sm text-slate-500">
          O app continua funcionando com localStorage. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` para ativar login e nuvem.
        </p>
      </section>
    );
  }

  if (session?.user) {
    return (
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <article className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <User size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Conta conectada</h2>
              <p className="mt-1 text-sm text-slate-500">{session.user.email}</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <button
              onClick={migrateLocalDataToCloud}
              disabled={cloudLoading}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload size={18} /> Migrar dados locais para minha conta
            </button>
            <button onClick={signOut} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-3 font-semibold">
              <LogOut size={18} /> Sair
            </button>
          </div>
        </article>
        <article className="rounded-lg border border-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Sincronização</h2>
          <p className="mt-2 text-sm text-slate-500">
            Quando você está logado, os dados são salvos no Supabase e também continuam no localStorage como backup local.
          </p>
          <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{syncMessage || 'Aguardando alterações.'}</div>
        </article>
      </section>
    );
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form onSubmit={submitAuth} className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{mode === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        <p className="mt-1 text-sm text-slate-500">O login fica separado do painel principal. Sem login, o app segue usando localStorage.</p>
        <div className="mt-5 grid gap-4">
          <Field label="E-mail">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input" required />
          </Field>
          <Field label="Senha">
            <input type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} className="input" required />
          </Field>
          {authMessage && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{authMessage}</div>}
          <button disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white disabled:opacity-60">
            <User size={18} /> {submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setAuthMessage('');
            }}
            className="text-sm font-semibold text-emerald-700"
          >
            {mode === 'login' ? 'Criar uma nova conta' : 'Já tenho conta'}
          </button>
        </div>
      </form>
      <article className="rounded-lg border border-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Modo sem login</h2>
        <p className="mt-2 text-sm text-slate-500">
          Dados salvos apenas neste dispositivo. Faça login para sincronizar com Supabase quando quiser.
        </p>
      </article>
    </section>
  );
}

function Dashboard({ account, forecasts, nextDueBills, currentBills, chartData, selectedMonth }) {
  const nextBill = nextDueBills[0];
  const cards = [
    { label: 'Saldo atual em conta', value: money(account.currentBalance), icon: Wallet, tone: 'emerald' },
    { label: 'Renda prevista do mês', value: money(forecasts.incomeExpected), icon: ArrowUpCircle, tone: 'blue' },
    { label: 'Total já pago', value: money(forecasts.paidTotal), icon: CheckCircle2, tone: 'green' },
    { label: 'Total pendente', value: money(forecasts.pendingTotal), icon: Clock3, tone: 'amber' },
    { label: 'Sobra prevista no mês', value: money(forecasts.currentForecast), icon: PiggyBank, tone: forecasts.currentForecast >= 0 ? 'emerald' : 'red' },
    { label: 'Sobra prevista próximo mês', value: money(forecasts.nextForecast), icon: Target, tone: forecasts.nextForecast >= 0 ? 'emerald' : 'red' },
    { label: 'Livre para gastar', value: money(forecasts.freeToSpend), icon: CircleDollarSign, tone: forecasts.freeToSpend >= 0 ? 'green' : 'red' },
    { label: 'Próxima conta', value: nextBill ? money(nextBill.value) : 'Sem pendências', detail: nextBill ? `${nextBill.name} - dia ${nextBill.dueDay}` : 'Tudo certo', icon: CalendarDays, tone: 'slate' },
  ];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Próximas contas</h2>
              <p className="text-sm text-slate-500">Vencidas, vencendo e futuras em {selectedMonth}.</p>
            </div>
            <ListChecks className="text-slate-400" size={22} />
          </div>
          <div className="space-y-3">
            {currentBills.slice(0, 8).map((bill) => (
              <BillListItem key={bill.id} bill={bill} />
            ))}
            {!currentBills.length && <EmptyState text="Cadastre contas fixas para acompanhar vencimentos aqui." />}
          </div>
        </article>

        <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Saúde do próximo mês</h2>
          <HealthGauge value={forecasts.nextForecast} />
          <div className="mt-5 grid gap-3">
            <MiniRow label="Entra" value={money(forecasts.nextIncome)} positive />
            <MiniRow label="Sai" value={money(forecasts.nextOutflow)} />
            <MiniRow label="Sobra" value={money(forecasts.nextForecast)} positive={forecasts.nextForecast >= 0} />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Pago, pendente e livre">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData.plannedVsDone}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
              <Tooltip formatter={(value) => money(value)} />
              <Bar dataKey="value" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Gastos por categoria">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData.byCategory} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} paddingAngle={3}>
                {chartData.byCategory.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => money(value)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Gastos avulsos no mês">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" />
              <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
              <Tooltip formatter={(value) => money(value)} />
              <Area type="monotone" dataKey="gasto" stroke="#dc2626" fill="#fee2e2" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }) {
  const toneClass = {
    emerald: 'bg-emerald-50 text-emerald-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];

  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
          {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-lg ${toneClass}`}>
          <Icon size={22} />
        </div>
      </div>
    </article>
  );
}

function Balance({ account, updateAccount }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Saldo e renda</h2>
        <div className="grid gap-4">
          <MoneyField label="Saldo atual da conta" value={account.currentBalance} onChange={(value) => updateAccount('currentBalance', value)} />
          <MoneyField label="Renda prevista do mês atual" value={account.currentIncomeExpected} onChange={(value) => updateAccount('currentIncomeExpected', value)} />
          <MoneyField label="Renda prevista do próximo mês" value={account.nextIncomeExpected} onChange={(value) => updateAccount('nextIncomeExpected', value)} />
          <MoneyField label="Saldo anterior" value={account.previousBalance} onChange={(value) => updateAccount('previousBalance', value)} />
          <MoneyField label="Reserva/meta mínima desejada" value={account.minimumReserve} onChange={(value) => updateAccount('minimumReserve', value)} />
        </div>
      </article>
      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Resumo rápido</h2>
        <p className="text-sm text-slate-500">Esses valores são informados manualmente e servem como base das previsões do dashboard.</p>
        <div className="mt-5 space-y-3">
          <MiniRow label="Saldo atual" value={money(account.currentBalance)} positive={account.currentBalance >= 0} />
          <MiniRow label="Renda este mês" value={money(account.currentIncomeExpected)} positive />
          <MiniRow label="Renda próximo mês" value={money(account.nextIncomeExpected)} positive />
          <MiniRow label="Meta mínima" value={money(account.minimumReserve)} />
        </div>
      </article>
    </section>
  );
}

function FixedBills({ billForm, setBillForm, addFixedBill, bills, categories, month, toggleBillPaid, removeFixedBill }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <form onSubmit={addFixedBill} className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Nova conta fixa</h2>
        <div className="grid gap-4">
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
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white">
            <Plus size={18} /> Adicionar conta
          </button>
        </div>
      </form>

      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Checklist do mês</h2>
        <div className="grid gap-3">
          {bills.map((bill) => (
            <div key={bill.id} className="flex flex-col gap-3 rounded-lg border border-line p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleBillPaid(bill.id, month)}
                  className={`grid h-12 w-12 place-items-center rounded-lg border text-white ${bill.status === 'Pago' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white text-slate-400'}`}
                  title={bill.status === 'Pago' ? 'Marcar como não pago' : 'Marcar como pago'}
                >
                  <CheckCircle2 size={22} />
                </button>
                <div>
                  <p className="font-semibold">{bill.name}</p>
                  <p className="text-sm text-slate-500">Dia {bill.dueDay} - {bill.category}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 md:justify-end">
                <BillStatusBadge bill={bill} />
                <p className="min-w-28 text-right text-lg font-semibold">{money(bill.value)}</p>
                <button onClick={() => removeFixedBill(bill.id)} className="grid h-10 w-10 place-items-center rounded-lg border border-line text-rose-700" title="Excluir">
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
          {!bills.length && <EmptyState text="Nenhuma conta fixa ativa cadastrada para este mês." />}
        </div>
      </article>
    </section>
  );
}

function QuickExpense({ quickExpense, setQuickExpense, addQuickExpense, categories, showAdvanced, setShowAdvanced, recentEntries }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form onSubmit={addQuickExpense} className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Cadastro rápido de gasto</h2>
        <div className="grid gap-4">
          <Field label="Descrição">
            <input value={quickExpense.description} onChange={(event) => setQuickExpense({ ...quickExpense, description: event.target.value })} className="input" required />
          </Field>
          <MoneyField label="Valor" value={quickExpense.value} onChange={(value) => setQuickExpense({ ...quickExpense, value })} raw />
          <Select label="Categoria" value={quickExpense.category} options={categories} onChange={(value) => setQuickExpense({ ...quickExpense, category: value })} />
          <Select label="Forma de pagamento" value={quickExpense.paymentMethod} options={PAYMENT_METHODS} onChange={(value) => setQuickExpense({ ...quickExpense, paymentMethod: value })} />
          <Field label="Data">
            <input type="date" value={quickExpense.date} onChange={(event) => setQuickExpense({ ...quickExpense, date: event.target.value })} className="input" />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex min-h-11 items-center justify-between rounded-lg border border-line px-4 py-2 text-sm font-semibold"
          >
            Opções avançadas <ChevronDown className={showAdvanced ? 'rotate-180 transition' : 'transition'} size={18} />
          </button>
          {showAdvanced && (
            <div className="grid gap-4 rounded-lg bg-slate-50 p-4">
              <Select label="Tipo" value={quickExpense.type} options={TYPES} onChange={(value) => setQuickExpense({ ...quickExpense, type: value })} />
              <Select label="Status" value={quickExpense.status} options={STATUSES} onChange={(value) => setQuickExpense({ ...quickExpense, status: value })} />
              <Field label="Observação">
                <textarea value={quickExpense.note} onChange={(event) => setQuickExpense({ ...quickExpense, note: event.target.value })} className="input min-h-24 resize-y" />
              </Field>
            </div>
          )}

          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white">
            <Plus size={18} /> Salvar gasto
          </button>
        </div>
      </form>

      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Últimos lançamentos</h2>
        <div className="space-y-3">
          {recentEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-4">
              <div>
                <p className="font-semibold">{entry.description}</p>
                <p className="text-sm text-slate-500">{entry.category} - {entry.paymentMethod} - {entry.status}</p>
              </div>
              <p className={entry.type === 'Receita' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-900'}>{money(entry.value)}</p>
            </div>
          ))}
          {!recentEntries.length && <EmptyState text="Nenhum gasto cadastrado ainda." />}
        </div>
      </article>
    </section>
  );
}

function NextMonthPlanning({ month, account, nextPlanning, forecasts, updatePlanningValue }) {
  const health = forecasts.nextForecast < 0 ? 'negativo' : forecasts.nextForecast < Number(nextPlanning.reserva || account.minimumReserve || 0) ? 'apertado' : 'saudável';
  const healthClass = health === 'saudável' ? 'bg-emerald-50 text-emerald-700' : health === 'apertado' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700';

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Planejamento do próximo mês</h2>
        <p className="mb-5 text-sm text-slate-500">{month}</p>
        <div className="grid gap-4">
          <MoneyField label="Renda prevista do próximo mês" value={nextPlanning.renda} onChange={(value) => updatePlanningValue(month, 'renda', value)} />
          <MoneyField label="Gastos variáveis planejados" value={nextPlanning.despesas} onChange={(value) => updatePlanningValue(month, 'despesas', value)} />
          <MoneyField label="Investimentos planejados" value={nextPlanning.investimentos} onChange={(value) => updatePlanningValue(month, 'investimentos', value)} />
          <MoneyField label="Dívidas planejadas" value={nextPlanning.dividas} onChange={(value) => updatePlanningValue(month, 'dividas', value)} />
          <MoneyField label="Reserva/meta de sobra" value={nextPlanning.reserva} onChange={(value) => updatePlanningValue(month, 'reserva', value)} />
        </div>
      </article>

      <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Previsão calculada</h2>
            <p className="text-sm text-slate-500">Saldo atual + renda prevista - saídas planejadas.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${healthClass}`}>{health}</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <MiniRow label="Saldo atual" value={money(account.currentBalance)} positive={account.currentBalance >= 0} />
          <MiniRow label="Quanto entra" value={money(nextPlanning.renda || account.nextIncomeExpected)} positive />
          <MiniRow label="Contas fixas previstas" value={money(forecasts.nextFixedBills)} />
          <MiniRow label="Gastos variáveis" value={money(nextPlanning.despesas)} />
          <MiniRow label="Dívidas" value={money(nextPlanning.dividas)} />
          <MiniRow label="Investimentos" value={money(nextPlanning.investimentos)} />
        </div>
        <div className="mt-6 rounded-lg bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-500">Sobra prevista do próximo mês</p>
          <p className={`mt-2 text-3xl font-semibold ${forecasts.nextForecast >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{money(forecasts.nextForecast)}</p>
        </div>
      </article>
    </section>
  );
}

function BillListItem({ bill }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold">{bill.name}</p>
        <p className="text-sm text-slate-500">Dia {bill.dueDay} - {bill.category}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <BillStatusBadge bill={bill} />
        <p className="font-semibold">{money(bill.value)}</p>
      </div>
    </div>
  );
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

function HealthGauge({ value }) {
  const state = value < 0 ? 'Negativo' : value < 1000 ? 'Apertado' : 'Saudável';
  const className = value < 0 ? 'bg-rose-600' : value < 1000 ? 'bg-amber-500' : 'bg-emerald-600';
  const width = value < 0 ? 20 : value < 1000 ? 58 : 100;

  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{state}</span>
        <span className={value >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{money(value)}</span>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${className}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </article>
  );
}

function MoneyField({ label, value, onChange, raw = false }) {
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        value={raw ? value : value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="input"
        placeholder="0,00"
      />
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

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold">
      {label}
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-emerald-600" />
    </label>
  );
}

function MiniRow({ label, value, positive = false }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-3">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`font-semibold ${positive ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

export default App;
