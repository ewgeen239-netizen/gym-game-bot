# Google Sheets — пошаговая настройка хранилища

GymGame Club хранит игроков, тренировки, клубы и дуэли в одной Google-таблице.
Бэкенд сам создаёт нужные вкладки при первом запуске — тебе нужно только:
создать проект в Google Cloud, сделать **сервис-аккаунт**, скачать его
**JSON-ключ**, создать таблицу и **расшарить** её на сервис-аккаунт.

Всё бесплатно. Занимает ~10 минут.

---

## Шаг 1. Проект в Google Cloud

1. Открой <https://console.cloud.google.com/>.
2. Вверху слева — селектор проекта → **New Project**.
3. Имя: `gymgame` (любое) → **Create**.
4. Дождись создания и выбери проект в селекторе.

## Шаг 2. Включить API

Нужны два API. Для каждого: открой ссылку (проект должен быть выбран) → **Enable**.

1. **Google Sheets API** → <https://console.cloud.google.com/apis/library/sheets.googleapis.com>
2. **Google Drive API** → <https://console.cloud.google.com/apis/library/drive.googleapis.com>

> Drive API нужен, чтобы `gspread` мог открывать таблицу по ID и работать с доступом.

## Шаг 3. Сервис-аккаунт

1. **APIs & Services → Credentials**
   (<https://console.cloud.google.com/apis/credentials>).
2. **Create credentials → Service account**.
3. Имя: `gymgame-bot` → **Create and continue**.
4. Роль можно не выбирать (доступ дадим на уровне таблицы) → **Continue → Done**.

## Шаг 4. JSON-ключ

1. В списке **Service Accounts** открой созданный аккаунт.
2. Вкладка **Keys → Add key → Create new key**.
3. Тип **JSON** → **Create**. Файл `*.json` скачается — **это секрет, не коммить его**.
4. Открой файл. Понадобятся два поля:
   - `client_email` — вида `gymgame-bot@gymgame-xxxx.iam.gserviceaccount.com`
   - весь JSON целиком (пойдёт в переменную `GOOGLE_SHEETS_CREDS`)

Пример структуры (значения свои):
```json
{
  "type": "service_account",
  "project_id": "gymgame-xxxx",
  "private_key_id": "…",
  "private_key": "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n",
  "client_email": "gymgame-bot@gymgame-xxxx.iam.gserviceaccount.com",
  "client_id": "…",
  "token_uri": "https://oauth2.googleapis.com/token",
  …
}
```

## Шаг 5. Таблица + доступ

1. Создай пустую таблицу: <https://sheets.new>.
2. Назови, например, `GymGame DB`.
3. Скопируй **ID таблицы** из URL — часть между `/d/` и `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit
                                          └──────────── это ID ────────────┘
   ```
4. Нажми **Share (Настройки доступа)** → вставь `client_email` из ключа →
   роль **Editor (Редактор)** → сними «Notify people» → **Share / Готово**.

> Без этого шага бэкенд получит `PermissionError` / `403` — сервис-аккаунт
> должен быть редактором именно этой таблицы.

## Шаг 6. Переменные окружения

В Railway (Settings → Variables) добавь:

| Переменная | Значение |
|---|---|
| `GOOGLE_SHEET_ID` | ID таблицы из шага 5 |
| `GOOGLE_SHEETS_CREDS` | **весь** JSON из шага 4, вставленный как одно значение |

Railway принимает многострочное значение — можно вставить JSON как есть,
переносы строк в `private_key` сохранять. Если твой хостинг требует одну строку —
JSON и так валиден в одну строку, `\n` внутри `private_key` уже экранированы.

## Шаг 7. Проверка

1. Задеплой/перезапусти бэкенд. В логах должно быть:
   ```
   Storage backend: Google Sheets
   ```
2. Открой Mini App, залогай подход. В таблице появятся вкладки и строки:
   - **Users** — твой профиль
   - **Workouts** — запись подхода
   - **Clubs**, **Duels** — по мере использования

Локально то же самое:
```bash
export GOOGLE_SHEET_ID='...'
export GOOGLE_SHEETS_CREDS="$(cat /путь/к/ключу.json)"
python -m bot.main
```

---

## Что во вкладках (схема)

Бэкенд создаёт заголовки автоматически; править вручную не нужно.

- **Users** — `user_id, username, first_name, created_at, level, xp, total_xp,
  strength, endurance, agility, streak, last_workout, total_sets, tier, skin,
  equipment(JSON), achievements(JSON), quests(JSON), club_id, referrer_id, duels_won`
- **Workouts** — `id, user_id, ts, exercise, name, muscle_group, stat, sets,
  reps, weight, xp_gained`
- **Clubs** — `club_id, name, owner_id, created_at, members(JSON), total_xp`
- **Duels** — `duel_id, challenger_id, opponent_id, week, challenger_xp,
  opponent_xp, status, created_at`

Списки/словари (`equipment`, `achievements`, `quests`, `members`) хранятся как
JSON-строка в одной ячейке — таблица остаётся читаемой, структура не теряется.

---

## Частые ошибки

| Симптом | Причина / решение |
|---|---|
| `403 PERMISSION_DENIED` | Таблица не расшарена на `client_email` (шаг 5) — дай **Editor**. |
| `APIError: Drive API has not been used` | Не включён **Drive API** (шаг 2). |
| `SpreadsheetNotFound` | Неверный `GOOGLE_SHEET_ID`. |
| В логах `Storage backend: local JSON` | Пустая одна из переменных — проверь обе. |
| `Invalid JWT / invalid_grant` | Повреждён `private_key` (потеряны `\n`) — перевставь весь JSON. |

> Не используешь Sheets? Оставь `GOOGLE_SHEETS_CREDS` и `GOOGLE_SHEET_ID`
> пустыми — приложение автоматически перейдёт на локальный JSON-файл
> (`DATA_FILE`). Данные не переживут редеплой без volume.
