-- «Купуй вчасно» — схема Supabase (Postgres). Запустіть у SQL Editor.
create table if not exists products (
  id bigserial primary key,
  slug text unique not null,
  name text not null,
  brand text,
  family text,
  generation int,
  model text,
  gtin text,
  weight_kg numeric,
  created_at timestamptz default now()
);
create index if not exists products_gtin_idx on products (gtin);

create table if not exists offers (
  id bigserial primary key,
  product_id bigint references products(id) on delete cascade,
  source text not null,          -- hotline | rozetka | idealo | geizhals | seed
  country text not null check (country in ('UA','DE')),
  currency text not null check (currency in ('UAH','EUR')),
  url text,
  unique (product_id, source)
);

create table if not exists price_points (
  offer_id bigint references offers(id) on delete cascade,
  day date not null,
  price numeric not null,
  crossed_price numeric,
  shows_30d_low boolean,
  primary key (offer_id, day)
);

-- Анонімні перевірки знижок від користувачів (без IP, без cookies)
create table if not exists checks (
  id bigserial primary key,
  created_at timestamptz default now(),
  country text not null check (country in ('UA','DE')),
  verdict text not null,
  claimed numeric,
  real numeric,
  pangv_violation boolean default false
);
create index if not exists checks_created_idx on checks (created_at);

alter table checks enable row level security;
-- Доступ лише через service role з сервера Next.js, публічних політик нема.
