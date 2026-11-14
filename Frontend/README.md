# Frontend — сайт LAST LIGHT

React 19 · TypeScript · Vite 7 · Redux Toolkit (+ RTK Query) · CSS Modules · Vitest.

```bash
npm install
npm run dev         # http://localhost:5173, /api проксируется на Django :8000
npm run typecheck   # проверка типов
npm test            # тесты
npm run build       # сборка в dist/
```

## Структура

```text
src/
├── main.tsx           точка входа
├── App.tsx            раскладка экрана: собирает фичи вместе
├── app/               «двигатель» приложения
│   ├── store.ts           Redux store: все слайсы + API
│   └── worker/            Web Worker: запускает simulate вне основного потока
├── sim/               ВСЯ ФИЗИКА (контракт ТЗ, с. 2) — чистые функции, без React
│   ├── types.ts           SitesFile, Site, Hour, Plan, Result
│   ├── simulate.ts        simulate(site, plan) → Result
│   ├── search.ts          findNearestStart — ближайшая удачная дата
│   ├── capacity.ts        minCapacityFor (P1-1)
│   └── uncertainty.ts     uncertainty (P1-4)
├── features/          одна папка = одна часть экрана
│   ├── datasets/          загрузка набора с сервера, метка DEMO DATA, «Источники»
│   ├── plan/              левая панель: площадка, дата, параметры аппарата
│   ├── result/            вердикт и KPI
│   ├── why/               «Почему» — 3 объяснения из чисел Result
│   ├── scene/             иллюстрация: аппарат, Солнце, Земля, рельеф
│   ├── timeline/          таймлайн 168 ч: свет, Земля, батарея; play/скорость
│   ├── horizon/           график профиля горизонта
│   ├── calendar/          календарь удачных дат
│   ├── fix/               «Как исправить» (P1)
│   ├── auth/              вход и регистрация
│   └── runs/              история запусков (только для вошедших)
├── shared/            общее, без бизнес-логики
│   ├── api/               baseApi — один RTK Query клиент для Django
│   ├── i18n/              ru.ts, en.ts — ВСЕ тексты интерфейса
│   ├── layout/            AppShell, Header
│   ├── ui/                Button, Panel, Slider, Badge…
│   └── lib/               format.ts и мелкие хелперы
└── styles/            tokens.css (цвета, отступы), base.css
```

## Как устроена фича

```text
features/timeline/
├── index.ts              что фича отдаёт наружу (App.tsx импортирует только отсюда)
├── viewSlice.ts          состояние (если нужно): Redux slice
├── timelineApi.ts        запросы к серверу (если нужно): baseApi.injectEndpoints
├── components/
│   ├── Timeline.tsx
│   └── Timeline.module.css
└── Timeline.test.tsx     тесты рядом с кодом
```

## Правила

1. Зависимости сверху вниз: `features → shared`, `features → app → sim`. `shared` не импортирует `features`.
2. Компоненты **не вызывают `simulate` напрямую** — только через `app/worker`.
3. Ответы Worker со старой `revision` плана отбрасываются.
4. Курсор времени, play, скорость и язык — **не** часть `Plan` (они в `viewSlice`).
5. Никакого текста в компонентах — только `t('ключ')` из `shared/i18n`.
6. Время — UTC: `toLocaleString(..., { timeZone: 'UTC' })`.
7. Нет P1-поля в данных (`horizonByMast`, `horizonClones`) → соответствующий элемент скрыт.
