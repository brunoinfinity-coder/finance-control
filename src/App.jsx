import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Download,
  Edit3,
  Filter,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Plus,
  Search,
  Target,
  Trash2,
  Upload,
  WalletCards,
  X,
} from 'lucide-react';

const STORAGE_KEY = 'finance-control:v1';

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

const TYPES = ['Receita', 'Conta', 'Despesa', 'Dívida', 'Investimento'];
const PAYMENT_METHODS = ['Crédito', 'Débito', 'Pix', 'Dinheiro', 'Boleto'];
const STATUSES = ['Pago', 'Pendente', 'Planejado'];
const EXPENSE_TYPES = ['Conta', 'Despesa', 'Dívida', 'Investimento'];
const CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0f766e', '#db2777', '#64748b'];

const today = new Date();
const CURRENT_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

const emptyEntry = {
  date: today.toISOString().slice(0, 10),
  type: 'Despesa',
  description: '',
  category: 'Outros',
  paymentMethod: 'Pix',
  value: '',
  status: 'Pago',
  note: '',
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function monthFromDate(date) {
  return date?.slice(0, 7) || CURRENT_MONTH;
}

function money(value) {
  return currency.format(Number(value) || 0);
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  const normalized = String(value || '0').replace(/\./g, '').replace(',', '.');
  return Number(normalized) || 0;
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
    categories: Object.fromEntries(DEFAULT_CATEGORIES.map((category) => [category, 0])),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], planning: { [CURRENT_MONTH]: defaultPlanning() }, categories: DEFAULT_CATEGORIES };
    const parsed = JSON.parse(raw);
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      planning: parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : { [CURRENT_MONTH]: defaultPlanning() },
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES,
    };
  } catch {
    return { entries: [], planning: { [CURRENT_MONTH]: defaultPlanning() }, categories: DEFAULT_CATEGORIES };
  }
}

function sumBy(entries, predicate) {
  return entries.filter(predicate).reduce((total, entry) => total + Number(entry.value || 0), 0);
}

function App() {
  const initialData = useMemo(loadData, []);
  const [entries, setEntries] = useState(initialData.entries);
  const [planning, setPlanning] = useState(initialData.planning);
  const [categories, setCategories] = useState(initialData.categories);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [activeView, setActiveView] = useState('dashboard');
  const [editingId, setEditingId] = useState(null);
  const [entryForm, setEntryForm] = useState(emptyEntry);
  const [filters, setFilters] = useState({
    search: '',
    month: CURRENT_MONTH,
    category: '',
    type: '',
    paymentMethod: '',
  });
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, planning, categories }));
  }, [entries, planning, categories]);

  const monthPlanning = planning[selectedMonth] || defaultPlanning(selectedMonth);
  const monthEntries = entries.filter((entry) => entry.month === selectedMonth);
  const paidMonthEntries = monthEntries.filter((entry) => entry.status === 'Pago');
  const realizedEntries = monthEntries.filter((entry) => entry.status !== 'Planejado');

  const totals = useMemo(() => {
    const incomePaid = sumBy(paidMonthEntries, (entry) => entry.type === 'Receita');
    const expensesPaid = sumBy(paidMonthEntries, (entry) => EXPENSE_TYPES.includes(entry.type));
    const incomeRealized = sumBy(realizedEntries, (entry) => entry.type === 'Receita');
    const expensesRealized = sumBy(realizedEntries, (entry) => EXPENSE_TYPES.includes(entry.type));
    const plannedIncome = Number(monthPlanning.renda || 0);
    const plannedOut = Number(monthPlanning.contas || 0) + Number(monthPlanning.despesas || 0) + Number(monthPlanning.dividas || 0) + Number(monthPlanning.investimentos || 0);

    return {
      incomePaid,
      expensesPaid,
      balance: incomePaid - expensesPaid,
      forecast: (incomeRealized || plannedIncome) - (expensesRealized || plannedOut),
      contas: sumBy(paidMonthEntries, (entry) => entry.type === 'Conta'),
      despesas: sumBy(paidMonthEntries, (entry) => entry.type === 'Despesa'),
      dividas: sumBy(paidMonthEntries, (entry) => entry.type === 'Dívida'),
      investimentos: sumBy(paidMonthEntries, (entry) => entry.type === 'Investimento'),
      committed: incomePaid > 0 ? (expensesPaid / incomePaid) * 100 : 0,
      plannedOut,
    };
  }, [monthPlanning, paidMonthEntries, realizedEntries]);

  const filteredEntries = entries
    .filter((entry) => !filters.month || entry.month === filters.month)
    .filter((entry) => !filters.category || entry.category === filters.category)
    .filter((entry) => !filters.type || entry.type === filters.type)
    .filter((entry) => !filters.paymentMethod || entry.paymentMethod === filters.paymentMethod)
    .filter((entry) => entry.description.toLowerCase().includes(filters.search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  const chartData = useMemo(() => {
    const plannedVsPaid = [
      { name: 'Renda', planejado: Number(monthPlanning.renda || 0), pago: sumBy(paidMonthEntries, (entry) => entry.type === 'Receita') },
      { name: 'Contas', planejado: Number(monthPlanning.contas || 0), pago: sumBy(paidMonthEntries, (entry) => entry.type === 'Conta') },
      { name: 'Despesas', planejado: Number(monthPlanning.despesas || 0), pago: sumBy(paidMonthEntries, (entry) => entry.type === 'Despesa') },
      { name: 'Dívidas', planejado: Number(monthPlanning.dividas || 0), pago: sumBy(paidMonthEntries, (entry) => entry.type === 'Dívida') },
      { name: 'Invest.', planejado: Number(monthPlanning.investimentos || 0), pago: sumBy(paidMonthEntries, (entry) => entry.type === 'Investimento') },
    ];

    const paidExpenses = paidMonthEntries.filter((entry) => EXPENSE_TYPES.includes(entry.type));
    const byCategory = categories
      .map((category) => ({ name: category, value: sumBy(paidExpenses, (entry) => entry.category === category) }))
      .filter((item) => item.value > 0);
    const byPayment = PAYMENT_METHODS
      .map((method) => ({ name: method, value: sumBy(paidExpenses, (entry) => entry.paymentMethod === method) }))
      .filter((item) => item.value > 0);
    const daysInMonth = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
    const daily = Array.from({ length: daysInMonth }, (_, index) => {
      const day = String(index + 1).padStart(2, '0');
      return {
        day,
        gasto: sumBy(paidExpenses, (entry) => entry.date === `${selectedMonth}-${day}`),
      };
    });

    return { plannedVsPaid, byCategory, byPayment, daily };
  }, [categories, monthPlanning, paidMonthEntries, selectedMonth]);

  function saveEntry(event) {
    event.preventDefault();
    const entry = {
      ...entryForm,
      id: editingId || uid(),
      month: monthFromDate(entryForm.date),
      value: parseMoney(entryForm.value),
      description: entryForm.description.trim(),
      category: entryForm.category || 'Outros',
      note: entryForm.note.trim(),
    };

    if (!entry.description || entry.value <= 0) return;

    setEntries((current) => (editingId ? current.map((item) => (item.id === editingId ? entry : item)) : [entry, ...current]));
    setSelectedMonth(entry.month);
    setFilters((current) => ({ ...current, month: entry.month }));
    setEntryForm(emptyEntry);
    setEditingId(null);
  }

  function editEntry(entry) {
    setEditingId(entry.id);
    setEntryForm({ ...entry, value: String(entry.value).replace('.', ',') });
    setActiveView('entries');
  }

  function deleteEntry(id) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEntryForm(emptyEntry);
    }
  }

  function updatePlan(field, value) {
    setPlanning((current) => ({
      ...current,
      [selectedMonth]: {
        ...defaultPlanning(selectedMonth),
        ...current[selectedMonth],
        [field]: parseMoney(value),
      },
    }));
  }

  function updateCategoryPlan(category, value) {
    setPlanning((current) => {
      const existing = current[selectedMonth] || defaultPlanning(selectedMonth);
      return {
        ...current,
        [selectedMonth]: {
          ...defaultPlanning(selectedMonth),
          ...existing,
          categories: {
            ...defaultPlanning(selectedMonth).categories,
            ...existing.categories,
            [category]: parseMoney(value),
          },
        },
      };
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ entries, planning, categories, exportedAt: new Date().toISOString() }, null, 2)], {
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
        setEntries(Array.isArray(parsed.entries) ? parsed.entries : []);
        setPlanning(parsed.planning && typeof parsed.planning === 'object' ? parsed.planning : { [CURRENT_MONTH]: defaultPlanning() });
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
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-600 text-white">
            <CircleDollarSign size={24} />
          </div>
          <div>
            <p className="text-lg font-semibold">Finance Control</p>
            <p className="text-sm text-slate-500">Controle financeiro pessoal</p>
          </div>
        </div>
        <Navigation activeView={activeView} setActiveView={setActiveView} />
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-line bg-white/90 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">MVP local com localStorage</p>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Painel financeiro mensal</h1>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <label className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm">
                <CalendarDays size={18} className="text-slate-500" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => {
                    setSelectedMonth(event.target.value);
                    setFilters((current) => ({ ...current, month: event.target.value }));
                  }}
                  className="bg-transparent outline-none"
                />
              </label>
              <div className="flex gap-2">
                <button onClick={exportData} className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
                  <Download size={17} /> Exportar
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold"
                >
                  <Upload size={17} /> Importar
                </button>
                <input ref={fileInputRef} type="file" accept="application/json" onChange={importData} className="hidden" />
              </div>
            </div>
          </div>
          <div className="mt-4 lg:hidden">
            <Navigation activeView={activeView} setActiveView={setActiveView} compact />
          </div>
        </header>

        <div className="space-y-8 px-4 py-6 md:px-8">
          {activeView === 'dashboard' && <Dashboard totals={totals} chartData={chartData} />}
          {activeView === 'entries' && (
            <Entries
              entryForm={entryForm}
              setEntryForm={setEntryForm}
              saveEntry={saveEntry}
              editingId={editingId}
              setEditingId={setEditingId}
              categories={categories}
              entries={filteredEntries}
              filters={filters}
              setFilters={setFilters}
              editEntry={editEntry}
              deleteEntry={deleteEntry}
            />
          )}
          {activeView === 'planning' && (
            <Planning
              monthPlanning={monthPlanning}
              updatePlan={updatePlan}
              updateCategoryPlan={updateCategoryPlan}
              categories={categories}
              chartData={chartData}
              monthEntries={paidMonthEntries}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function Navigation({ activeView, setActiveView, compact = false }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'entries', label: 'Lançamentos', icon: ClipboardList },
    { id: 'planning', label: 'Planejamento', icon: Target },
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

function Dashboard({ totals, chartData }) {
  const cards = [
    { label: 'Renda total', value: money(totals.incomePaid), icon: ArrowUpCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
    { label: 'Total pago', value: money(totals.expensesPaid), icon: ArrowDownCircle, color: 'text-rose-700', bg: 'bg-rose-50' },
    { label: 'Saldo atual', value: money(totals.balance), icon: PiggyBank, color: totals.balance >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: 'bg-blue-50' },
    { label: 'Previsão de sobra', value: money(totals.forecast), icon: WalletCards, color: totals.forecast >= 0 ? 'text-emerald-700' : 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Contas', value: money(totals.contas), icon: Landmark, color: 'text-slate-700', bg: 'bg-slate-100' },
    { label: 'Despesas', value: money(totals.despesas), icon: BarChart3, color: 'text-indigo-700', bg: 'bg-indigo-50' },
    { label: 'Dívidas', value: money(totals.dividas), icon: ClipboardList, color: 'text-red-700', bg: 'bg-red-50' },
    { label: 'Investimentos', value: money(totals.investimentos), icon: PiggyBank, color: 'text-teal-700', bg: 'bg-teal-50' },
  ];

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-lg border border-line bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className={`mt-2 text-2xl font-semibold ${card.color}`}>{card.value}</p>
                </div>
                <div className={`grid h-11 w-11 place-items-center rounded-lg ${card.bg} ${card.color}`}>
                  <Icon size={22} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Renda comprometida</h2>
            <p className="text-sm text-slate-500">Pagamentos realizados sobre a renda paga do mês.</p>
          </div>
          <p className={`text-2xl font-semibold ${totals.committed > 80 ? 'text-rose-700' : totals.committed > 60 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {totals.committed.toFixed(1)}%
          </p>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${totals.committed > 80 ? 'bg-rose-600' : totals.committed > 60 ? 'bg-amber-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.min(totals.committed, 100)}%` }}
          />
        </div>
      </section>

      <Charts chartData={chartData} />
    </>
  );
}

function Charts({ chartData }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <ChartCard title="Planejado vs pago">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData.plannedVsPaid}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
            <Tooltip formatter={(value) => money(value)} />
            <Legend />
            <Bar dataKey="planejado" fill="#94a3b8" radius={[6, 6, 0, 0]} />
            <Bar dataKey="pago" fill="#16a34a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Gastos por categoria">
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={chartData.byCategory} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={3}>
              {chartData.byCategory.map((_, index) => (
                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => money(value)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Gastos por tipo de pagamento">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData.byPayment}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => `R$ ${value / 1000}k`} />
            <Tooltip formatter={(value) => money(value)} />
            <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Evolução diária dos gastos">
        <ResponsiveContainer width="100%" height={300}>
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

function Entries({ entryForm, setEntryForm, saveEntry, editingId, setEditingId, categories, entries, filters, setFilters, editEntry, deleteEntry }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form onSubmit={saveEntry} className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setEntryForm(emptyEntry);
              }}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line"
              title="Cancelar edição"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="grid gap-4">
          <Field label="Data">
            <input type="date" value={entryForm.date} onChange={(event) => setEntryForm({ ...entryForm, date: event.target.value })} required className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Tipo" value={entryForm.type} options={TYPES} onChange={(value) => setEntryForm({ ...entryForm, type: value })} />
            <Select label="Status" value={entryForm.status} options={STATUSES} onChange={(value) => setEntryForm({ ...entryForm, status: value })} />
          </div>
          <Field label="Descrição">
            <input value={entryForm.description} onChange={(event) => setEntryForm({ ...entryForm, description: event.target.value })} required className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Categoria" value={entryForm.category} options={categories} onChange={(value) => setEntryForm({ ...entryForm, category: value })} />
            <Select label="Forma de pagamento" value={entryForm.paymentMethod} options={PAYMENT_METHODS} onChange={(value) => setEntryForm({ ...entryForm, paymentMethod: value })} />
          </div>
          <Field label="Valor">
            <input inputMode="decimal" value={entryForm.value} onChange={(event) => setEntryForm({ ...entryForm, value: event.target.value })} required className="input" placeholder="0,00" />
          </Field>
          <Field label="Observação">
            <textarea value={entryForm.note} onChange={(event) => setEntryForm({ ...entryForm, note: event.target.value })} className="input min-h-24 resize-y" />
          </Field>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white">
            <Plus size={18} /> {editingId ? 'Salvar alterações' : 'Adicionar lançamento'}
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Lançamentos</h2>
            <p className="text-sm text-slate-500">{entries.length} registro(s) encontrado(s)</p>
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            <label className="input flex items-center gap-2">
              <Search size={16} className="text-slate-400" />
              <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Buscar" className="w-full bg-transparent outline-none" />
            </label>
            <input type="month" value={filters.month} onChange={(event) => setFilters({ ...filters, month: event.target.value })} className="input" />
            <FilterSelect value={filters.category} options={categories} placeholder="Categoria" onChange={(value) => setFilters({ ...filters, category: value })} />
            <FilterSelect value={filters.type} options={TYPES} placeholder="Tipo" onChange={(value) => setFilters({ ...filters, type: value })} />
            <FilterSelect value={filters.paymentMethod} options={PAYMENT_METHODS} placeholder="Pagamento" onChange={(value) => setFilters({ ...filters, paymentMethod: value })} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-y border-line bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Descrição</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Categoria</th>
                <th className="px-3 py-3">Pagamento</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="px-3 py-3">{entry.date.split('-').reverse().join('/')}</td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{entry.description}</p>
                    {entry.note && <p className="text-xs text-slate-500">{entry.note}</p>}
                  </td>
                  <td className="px-3 py-3">{entry.type}</td>
                  <td className="px-3 py-3">{entry.category}</td>
                  <td className="px-3 py-3">{entry.paymentMethod}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.status === 'Pago' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'Pendente' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                      {entry.status}
                    </span>
                  </td>
                  <td className={`px-3 py-3 text-right font-semibold ${entry.type === 'Receita' ? 'text-emerald-700' : 'text-slate-900'}`}>{money(entry.value)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => editEntry(entry)} className="grid h-9 w-9 place-items-center rounded-lg border border-line" title="Editar">
                        <Edit3 size={16} />
                      </button>
                      <button onClick={() => deleteEntry(entry.id)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-rose-700" title="Excluir">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td colSpan="8" className="px-3 py-12 text-center text-slate-500">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Planning({ monthPlanning, updatePlan, updateCategoryPlan, categories, chartData, monthEntries }) {
  const planFields = [
    ['renda', 'Renda planejada'],
    ['contas', 'Contas planejadas'],
    ['despesas', 'Despesas planejadas'],
    ['dividas', 'Dívidas planejadas'],
    ['investimentos', 'Investimentos planejados'],
  ];

  return (
    <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold">Planejamento mensal</h2>
        <div className="grid gap-4">
          {planFields.map(([field, label]) => (
            <Field key={field} label={label}>
              <input inputMode="decimal" value={monthPlanning[field] || ''} onChange={(event) => updatePlan(field, event.target.value)} className="input" placeholder="0,00" />
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-lg font-semibold">Categorias planejadas</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <Field key={category} label={category}>
                <input
                  inputMode="decimal"
                  value={monthPlanning.categories?.[category] || ''}
                  onChange={(event) => updateCategoryPlan(category, event.target.value)}
                  className="input"
                  placeholder="0,00"
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-700" />
            <h2 className="text-lg font-semibold">Comparativo realizado</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {chartData.plannedVsPaid.map((item) => (
              <div key={item.name} className="rounded-lg border border-line p-4">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-2 text-sm text-slate-500">Planejado: {money(item.planejado)}</p>
                <p className="text-sm text-slate-500">Pago: {money(item.pago)}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${item.planejado ? Math.min((item.pago / item.planejado) * 100, 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">{monthEntries.length} lançamento(s) pago(s) usados no comparativo.</p>
        </div>
      </div>
    </section>
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
    <label className="input flex items-center gap-2">
      <Filter size={16} className="text-slate-400" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent outline-none">
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default App;
