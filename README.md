# emojilab

Редактор анимированных эмодзи и стикеров Telegram. Работает целиком в браузере, сервер не нужен.

- открывает `.tgs`, `.json` (Lottie) и `.aep` (покажет подсказку, см. ниже)
- выбор анимированных эмодзи (Google Noto Animated Emoji)
- правка всех цветов, перелив между цветами
- проверка требований Telegram (512×512, 30/60 fps, до 3 с, до 64 КБ)
- экспорт в `.json` и `.tgs`

## Как выложить на GitHub Pages

1. Зайди на github.com → **New repository**. Название, например, `emojilab`. Выбери **Public**, нажми **Create repository**.
2. На странице репозитория нажми **uploading an existing file**, перетащи **всё содержимое папки** `emojilab` (index.html, папки css и js, файл .nojekyll, README.md). index.html должен лежать в корне, а не внутри вложенной папки. Нажми **Commit changes**.
3. Открой **Settings → Pages**. В разделе **Build and deployment** выбери Source: **Deploy from a branch**, Branch: **main**, папка **/ (root)**, нажми **Save**.
4. Через 1–2 минуты сайт откроется по адресу `https://ТВОЙ_НИК.github.io/emojilab/`. Ссылка появится вверху той же страницы Pages.

Если хочешь адрес без `/emojilab/`, назови репозиторий `ТВОЙ_НИК.github.io` — сайт будет на `https://ТВОЙ_НИК.github.io/`.

## Свой домен (по желанию)

В Settings → Pages → **Custom domain** впиши домен и добавь у регистратора CNAME-запись на `ТВОЙ_НИК.github.io`.

## Про .aep

`.aep` — закрытый проект After Effects, браузер не может его отрисовать. Редактор распознаёт файл и показывает названия внутри, но для правки нужен экспорт в Lottie: в After Effects через плагин Bodymovin (или LottieFiles) сохрани композицию как `.json`, потом открой её в редакторе.
