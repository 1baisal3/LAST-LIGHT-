# Как работать вместе

## Ветки

- `main` — всегда рабочая. Напрямую в неё не пушим.
- Задача → ветка `feat/<что-делаю>`, исправление → `fix/<что>`, документы → `docs/<что>`.
  Пример: `feat/timeline-play`, `fix/battery-threshold`.
- В `main` — только через Pull Request и хотя бы одно ревью.

## Коммиты

Коротко, с префиксом части проекта:

```text
front: кнопка play на таймлайне
sim: simulate считает заряд по часам
server: модель Run и список запусков
pipeline: запрос эфемерид в Horizons
docs: вопрос про пороги сцены
```

## Перед Pull Request

```bash
# фронт
cd Frontend && npm run typecheck && npm test
# бэк — команды добавит бэкендер в backend/README.md
```

В описании PR: что сделано, как проверить, что осталось неясным.

## Правила

- Меняете контракт (`backend/schemas/` или `Frontend/src/sim/types.ts`) → повысьте `version` и позовите другую команду в ревью.
- Тексты интерфейса — только через `Frontend/src/shared/i18n/{ru,en}.ts`.
- Секреты (`.env`, пароли, ключи) не коммитим — есть `.env.example`.
- Новая фича фронта = новая папка в `Frontend/src/features/` (см. [Frontend/README.md](Frontend/README.md)).
