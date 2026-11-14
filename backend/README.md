# LAST LIGHT backend

Django API для симуляции лунной миссии, поиска плана восстановления и хранения
личных сценариев. Все команды ниже выполняются из папки `backend/` репозитория.

## Запуск

```sh
cd backend
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
venv/bin/python manage.py migrate
venv/bin/python manage.py runserver 127.0.0.1:8000
```

Без настроенного `LOLA_DEM_PATH` сервер использует локальный демонстрационный
режим `synthetic-v1`, которому не нужны внешние данные или запросы к NASA.

- Swagger UI: <http://127.0.0.1:8000/swagger/>
- OpenAPI JSON: <http://127.0.0.1:8000/api/schema/?format=json>
- ReDoc: <http://127.0.0.1:8000/redoc/>

Документация доступна без авторизации. Для запросов к API нужен JWT Bearer token.

## Проверка

```sh
venv/bin/python manage.py check
venv/bin/python manage.py test
venv/bin/python manage.py spectacular --file /tmp/last-light-schema.yaml --validate --fail-on-warn
```

Подробное описание API, параметров симуляции и подключения реальных данных:
[mission/README.md](mission/README.md).
