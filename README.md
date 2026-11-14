# LAST LIGHT

Сайт для хакатона NASA: **выдержит ли лунный аппарат у южного полюса 7 суток (168 ч)** — хватит ли света для панелей, заряда батареи и связи с Землёй.
Пользователь выбирает площадку, дату и параметры аппарата → видит вердикт, таймлайн и три объяснения «почему».

> Статус: **каркас**. Папки, заготовки файлов и правила готовы; логика помечена `TODO`.
> Как всё устроено — [**ARCHITECTURE.md**](ARCHITECTURE.md).

## Из чего состоит

```text
LAST-LIGHT/
├── Frontend/     сайт: React + TypeScript + Vite        → команда фронта
└── backend/      сервер Django + данные NASA → команда бэка (код загружает бэкендер)
```

## Запуск

**Бэкенд** — инструкция появится в `backend/README.md`, когда бэкендер загрузит код.

**Фронтенд** (Node ≥ 22):

```bash
cd Frontend
npm install
npm run dev                       # http://localhost:5173
```

## Куда смотреть дальше

| Хочу… | Читать |
| --- | --- |
| понять, как части связаны | [ARCHITECTURE.md](ARCHITECTURE.md) |
| делать фронт | [Frontend/README.md](Frontend/README.md) |
| делать бэкенд | папка `backend/` (заполняет бэкендер) и [ARCHITECTURE.md](ARCHITECTURE.md) |
| правила веток и PR | [CONTRIBUTING.md](CONTRIBUTING.md) |
| что решено и что ещё нет | [ARCHITECTURE.md, разделы 6–7](ARCHITECTURE.md#6-принятые-решения) |
