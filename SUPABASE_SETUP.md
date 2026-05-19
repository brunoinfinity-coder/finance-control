# Supabase Setup - Finance Control

Este guia prepara autenticação e banco em nuvem para o Finance Control mantendo `localStorage` como fallback/backup local.

## 1. Criar projeto

1. Acesse https://supabase.com.
2. Crie um novo projeto.
3. Em `Project Settings > API`, copie:
   - `Project URL`
   - `anon public key`
4. Nunca use a `service_role key` no frontend.

## 2. Variáveis de ambiente

Localmente, crie `.env.local`:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

Na Netlify, configure as mesmas variáveis em `Site configuration > Environment variables`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Depois faça um novo deploy.

## 3. SQL completo

Rode o SQL abaixo no `SQL Editor` do Supabase.

```sql
create extension if not exists "pgcrypto";

create table if not exists public.financial_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  current_balance numeric(14, 2) not null default 0,
  current_income_expected numeric(14, 2) not null default 0,
  next_income_expected numeric(14, 2) not null default 0,
  previous_balance numeric(14, 2) not null default 0,
  minimum_reserve numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_settings_user_unique unique (user_id)
);

create table if not exists public.fixed_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric(14, 2) not null default 0,
  due_day integer not null check (due_day between 1 and 31),
  category text not null default 'Outros',
  recurring boolean not null default true,
  active boolean not null default true,
  start_month text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fixed_bill_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fixed_bill_id uuid not null references public.fixed_bills(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_bill_occurrence_unique unique (user_id, fixed_bill_id, year, month)
);

create table if not exists public.quick_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  value numeric(14, 2) not null default 0,
  category text not null default 'Outros',
  payment_method text not null default 'Pix',
  entry_date date not null,
  entry_month text not null,
  type text not null default 'Despesa',
  status text not null default 'Pago',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_planning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  expected_income numeric(14, 2) not null default 0,
  planned_variable_expenses numeric(14, 2) not null default 0,
  planned_debts numeric(14, 2) not null default 0,
  planned_investments numeric(14, 2) not null default 0,
  target_reserve numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_planning_user_month_unique unique (user_id, year, month)
);

create table if not exists public.monthly_revenue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  bruno_salary numeric(14, 2) not null default 0,
  mariah_salary numeric(14, 2) not null default 0,
  extra_income numeric(14, 2) not null default 0,
  other_income numeric(14, 2) not null default 0,
  bruno_food_card numeric(14, 2) not null default 0,
  mariah_food_card numeric(14, 2) not null default 0,
  food_card_outflows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_revenue_user_month_unique unique (user_id, year, month)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_user_name_unique unique (user_id, name)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_financial_settings_updated_at on public.financial_settings;
create trigger set_financial_settings_updated_at
before update on public.financial_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_fixed_bills_updated_at on public.fixed_bills;
create trigger set_fixed_bills_updated_at
before update on public.fixed_bills
for each row execute function public.set_updated_at();

drop trigger if exists set_fixed_bill_occurrences_updated_at on public.fixed_bill_occurrences;
create trigger set_fixed_bill_occurrences_updated_at
before update on public.fixed_bill_occurrences
for each row execute function public.set_updated_at();

drop trigger if exists set_quick_expenses_updated_at on public.quick_expenses;
create trigger set_quick_expenses_updated_at
before update on public.quick_expenses
for each row execute function public.set_updated_at();

drop trigger if exists set_monthly_planning_updated_at on public.monthly_planning;
create trigger set_monthly_planning_updated_at
before update on public.monthly_planning
for each row execute function public.set_updated_at();

drop trigger if exists set_monthly_revenue_updated_at on public.monthly_revenue;
create trigger set_monthly_revenue_updated_at
before update on public.monthly_revenue
for each row execute function public.set_updated_at();

drop trigger if exists set_categories_updated_at on public.categories;
create trigger set_categories_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

alter table public.financial_settings enable row level security;
alter table public.fixed_bills enable row level security;
alter table public.fixed_bill_occurrences enable row level security;
alter table public.quick_expenses enable row level security;
alter table public.monthly_planning enable row level security;
alter table public.monthly_revenue enable row level security;
alter table public.categories enable row level security;

create policy "Users can read own financial settings"
on public.financial_settings for select
using (auth.uid() = user_id);

create policy "Users can insert own financial settings"
on public.financial_settings for insert
with check (auth.uid() = user_id);

create policy "Users can update own financial settings"
on public.financial_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own financial settings"
on public.financial_settings for delete
using (auth.uid() = user_id);

create policy "Users can read own fixed bills"
on public.fixed_bills for select
using (auth.uid() = user_id);

create policy "Users can insert own fixed bills"
on public.fixed_bills for insert
with check (auth.uid() = user_id);

create policy "Users can update own fixed bills"
on public.fixed_bills for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own fixed bills"
on public.fixed_bills for delete
using (auth.uid() = user_id);

create policy "Users can read own fixed bill occurrences"
on public.fixed_bill_occurrences for select
using (auth.uid() = user_id);

create policy "Users can insert own fixed bill occurrences"
on public.fixed_bill_occurrences for insert
with check (auth.uid() = user_id);

create policy "Users can update own fixed bill occurrences"
on public.fixed_bill_occurrences for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own fixed bill occurrences"
on public.fixed_bill_occurrences for delete
using (auth.uid() = user_id);

create policy "Users can read own quick expenses"
on public.quick_expenses for select
using (auth.uid() = user_id);

create policy "Users can insert own quick expenses"
on public.quick_expenses for insert
with check (auth.uid() = user_id);

create policy "Users can update own quick expenses"
on public.quick_expenses for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own quick expenses"
on public.quick_expenses for delete
using (auth.uid() = user_id);

create policy "Users can read own monthly planning"
on public.monthly_planning for select
using (auth.uid() = user_id);

create policy "Users can insert own monthly planning"
on public.monthly_planning for insert
with check (auth.uid() = user_id);

create policy "Users can update own monthly planning"
on public.monthly_planning for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own monthly planning"
on public.monthly_planning for delete
using (auth.uid() = user_id);

create policy "Users can read own monthly revenue"
on public.monthly_revenue for select
using (auth.uid() = user_id);

create policy "Users can insert own monthly revenue"
on public.monthly_revenue for insert
with check (auth.uid() = user_id);

create policy "Users can update own monthly revenue"
on public.monthly_revenue for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own monthly revenue"
on public.monthly_revenue for delete
using (auth.uid() = user_id);

create policy "Users can read own categories"
on public.categories for select
using (auth.uid() = user_id);

create policy "Users can insert own categories"
on public.categories for insert
with check (auth.uid() = user_id);

create policy "Users can update own categories"
on public.categories for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own categories"
on public.categories for delete
using (auth.uid() = user_id);
```

## 4. Autenticação

Em `Authentication > Providers`, mantenha `Email` habilitado. Se quiser login sem confirmação por e-mail durante testes, ajuste em `Authentication > Sign In / Providers > Email`.

## 5. Como testar

1. Rode o app com `.env.local` configurado.
2. Acesse a aba `Login`.
3. Crie uma conta.
4. Faça login.
5. Cadastre receita do mês, saldo, conta fixa e gasto rápido.
6. Atualize a página e confirme que a sessão continua ativa.
7. Abra o Supabase Table Editor e confirme os dados com seu `user_id`.
8. Faça logout e confirme que o app continua funcionando com `localStorage`.
9. Faça login novamente e clique em `Migrar dados locais para minha conta`.
10. Confirme que os dados foram enviados para Supabase sem apagar o backup local.
11. Confira a tabela `monthly_revenue` para validar salários, cartão alimentação e saídas manuais.
