# Публикация frontend в Yandex Object Storage

Текущий frontend — статическое React/Vite-приложение. Его можно собрать в набор HTML/CSS/JavaScript-файлов и разместить в Yandex Object Storage как статический сайт.

## 1. Подготовить production-сборку

В каталоге `frontend` создайте локальный файл `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_GOOGLE_MAPS_API_KEY=ваш_google_maps_demo_key
```

Для текущего прототипа `VITE_API_BASE_URL` не используется backend-ом. Ключ Google Maps является браузерным ключом, поэтому после публикации ограничьте его по HTTP referrer.

Соберите приложение:

```bash
npm install
npm run build
```

После успешной сборки все файлы для публикации находятся в `frontend/dist/`.

## 2. Создать bucket

В консоли Yandex Cloud:

1. Откройте **Object Storage** и создайте bucket.
2. Выберите DNS-совместимое имя, например `route-duration-tracker-demo`.
3. Для прототипа включите публичное чтение объектов и списка объектов.
4. В настройках bucket откройте **Website hosting**.
5. Укажите:
   - главная страница: `index.html`;
   - страница ошибки: `index.html`.

Последний пункт нужен как fallback для React-маршрутов.

## 3. Загрузить сборку

Загрузите **содержимое** папки `dist`, а не саму папку целиком:

```text
dist/index.html       -> index.html
dist/assets/...       -> assets/...
```

После загрузки Object Storage покажет адрес сайта вида:

```text
https://<bucket-name>.website.yandexcloud.net
```

## 4. Ограничить Google Maps API key

В Google Cloud Console добавьте адрес опубликованного сайта в HTTP referrers ключа, например:

```text
https://route-duration-tracker-demo.website.yandexcloud.net/*
```

Локальный адрес `http://localhost:5173/*` можно оставить отдельным разрешённым referrer для разработки.

## Важно

Object Storage отдаёт только статические файлы. API, PostgreSQL, ежечасное обновление длительности и удаление неактивных маршрутов появятся на следующем этапе и будут размещены отдельно в Yandex Cloud.
