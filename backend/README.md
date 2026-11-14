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

## Подключение интерфейса

API версии 1.1.0 поддерживает непрерывный расчёт на 1–168 часов. Для недельной
миссии передайте `duration_hours: 168` в `POST /api/mission/`. Без этого поля
остаётся прежний расчёт на 24 часа. В ответе `duration_hours` соответствует длине
массива `hourly_data`. Состояние аппарата сохраняется между сутками; Fix Plan
проверяет кандидатов на тот же период.

1. `POST /api/auth/register/`: `username`, `email`, `password`.
2. `POST /api/auth/token/`: `username`, `password`; ответ содержит `access` и `refresh`.
3. В защищённых запросах передавайте `Authorization: Bearer <access>`.
4. `POST /api/auth/token/refresh/`: `refresh`; обновляет токен доступа.
5. `POST /api/runs/`: имя, параметры аппарата и `results` с исходным запросом и
   результатом. `GET /api/runs/` возвращает только запуски текущего пользователя
   с пагинацией; `GET /api/runs/{id}/` и `DELETE /api/runs/{id}/` работают только
   с его собственными записями.

Разрешены локальные адреса интерфейса `localhost` и `127.0.0.1` на портах 3000 и
5173. Сквозной тест API проверяет регистрацию, вход, расчёт 168 часов, сохранение,
чтение истории, обновление JWT и изоляцию пользователей.

## Проверка реальных источников

После регистрации настоящего LOLA GeoTIFF можно выполнить проверку интеграции
с живым JPL. Она не подменяет ошибку источника демонстрационными данными:

```sh
export LOLA_DEM_PATH=/absolute/path/to/normalized_lola_elevations.tif
venv/bin/python manage.py register_dataset "$LOLA_DEM_PATH"
venv/bin/python manage.py verify_mission_sources \
  --latitude -89.5 --longitude 32 --date 2026-11-15 --duration-hours 168 \
  --report /tmp/last-light-external-check.json
```

Команда проверяет контракт ответа, непрерывность времени и заряда, SHA-256
рельефа и архивов эфемерид Солнца и Земли. Это проверка интеграции, а не
калибровка физической модели или подтверждение точности прогноза. Для этого
нужны отдельные эталонные измерения и проверка систем координат.
