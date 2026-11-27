# Купуй вчасно

Сервис «знижка справжня чи намальована?» для украинцев в Украине и Германии. Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase (опционально), Vercel.

## Что работает

| Страница | Что делает |
|---|---|
| `/` | Главное поле поиска + «Чек перевірки» (3 цифры → вердикт), примеры, живой счётчик (если подключён Supabase) |
| `/perevir` → `/r?...` | Проверка своей скидки. Страница результата с OG-картинкой (превью в Threads) и PNG для сторис |
| `/kalkulyator` | Цена «в руках»: DE-цена + Нова Пошта / Meest / багаж + мито і ПДВ + курс НБУ vs UA-цена |
| `/tovar/[slug]` | 20 товаров на **демо-данных**: штампы UA/DE, UA vs DE, график 12 мес, метрики, прогноз, умная замена |
| `/stats` | «Чорна пʼятниця в цифрах» — только из реальных проверок пользователей |
| `/yak-rakhuyemo`, `/impressum`, `/datenschutz` | Методика и юридические страницы |

Пороги вердиктов: `src/config/verdict.ts`. Мито: `src/config/customs.ts` (сверено 27.11.2026, источники в файле). Доставка: `src/config/shipping.ts`. Сезоны: `src/config/seasons.ts`.

## Деплой (5 минут, без токенов)

1. vercel.com → **Add New → Project → Import** `dayvan777/threads-engine`, ветка `claude/keen-darwin-nbghga` (или после мержа — master).
2. **Root Directory: `kupuy`**. Project name: `kupuy-vchasno` (тогда адрес будет kupuy-vchasno.vercel.app).
3. Environment Variables:
   - `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_OPERATOR_STREET`, `NEXT_PUBLIC_OPERATOR_CITY`, `NEXT_PUBLIC_OPERATOR_EMAIL` — **обязательно** для Impressum в Германии.
   - `NEXT_PUBLIC_SITE_URL` — если адрес отличается от `https://kupuy-vchasno.vercel.app`.
   - `CRON_SECRET` — любая случайная строка.
4. Deploy. Vercel Analytics: вкладка Analytics → Enable.

### Supabase (для счётчика и /stats)
1. supabase.com → New project (регион EU, Frankfurt).
2. SQL Editor → вставить `supabase/schema.sql` → Run.
3. В Vercel добавить `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` (Settings → API). Redeploy.

Без Supabase сайт работает полностью, только счётчик скрыт, а `/stats` показывает «збираємо дані». Цифры не выдумываются.

## Источники цен
`src/lib/adapters/` — единый интерфейс `PriceAdapter`, вежливый HTTP-клиент (robots.txt, 1 запрос / 10 с на хост, кэш 6 ч), сопоставление по GTIN → номер модели (`src/lib/matching.ts`). Hotline, Rozetka, Idealo, Geizhals **выключены**: их условия запрещают автоматический сбор. Подключать через партнёрские фиды/API. Cron `/api/cron/collect` раз в сутки (лимит Hobby).

## Разработка
```
npm install
npm run dev      # http://localhost:3000
npm test         # вердикты, мито, проверка, GTIN, демо-каталог
npm run build
```
