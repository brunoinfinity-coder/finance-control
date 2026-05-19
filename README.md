# Finance Control

Finance Control é uma aplicação web de controle financeiro pessoal criada para substituir uma planilha de lançamentos, contas, despesas, dívidas, investimentos e planejamento mensal.

A versão atual é um MVP local, visual e prático, focado em responder rapidamente:

- Quanto tenho de saldo agora?
- Quais contas ainda vencem?
- O que já foi pago e o que não foi pago?
- Quanto vai sobrar este mês?
- Quanto vai sobrar no próximo mês considerando o planejamento?

## Stack

- React
- Vite
- Tailwind CSS
- Recharts
- Lucide React
- localStorage

## Como rodar localmente

Instale as dependências:

```bash
npm install
```

Rode o servidor de desenvolvimento:

```bash
npm run dev
```

Gere o build de produção:

```bash
npm run build
```

## Dados locais

Nesta fase, todos os dados são salvos no `localStorage` do navegador. Não há banco de dados, login, integração bancária, pagamentos ou Supabase em produção ainda.

## Deploy na Netlify

Configuração prevista:

- Build command: `npm run build`
- Publish directory: `dist`
- Base directory: vazio, pois o projeto está na raiz do repositório

O arquivo `netlify.toml` já deixa essa configuração preparada.

## Próxima fase: Supabase

Supabase será preparado em uma próxima etapa para persistência remota e autenticação, mas ainda não está integrado nesta versão.

Variáveis previstas:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use somente a `anon key` no frontend. Nunca use `service_role key` no código do cliente.

## Segurança

- Não commitar `.env` ou `.env.local`.
- Não colocar chaves privadas no código.
- Não usar `service_role` no frontend.
- Manter credenciais apenas em variáveis de ambiente locais ou no painel da plataforma de deploy.
