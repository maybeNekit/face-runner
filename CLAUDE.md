# Face Runner

Мобильная игра-раннер для детей 6–10 лет. Фишка: ребёнок загружает своё фото, и его лицо становится лицом персонажа, который бежит по трассе, прыгает через нелепые препятствия и смешно кувыркается при падении.

Всё генерируется кодом. Фото остаётся на устройстве.

## Статус

Готов каркас и пайплайн доставки. Игры пока нет: на экране заглушка «Работает!» с кнопкой смены фона. Она подтверждает, что цепочка код → GitHub → APK на телефоне работает целиком.

## Стек

- **Vite 8 + TypeScript 6** — сборка веб-части
- **Three.js** — рендер, вся геометрия процедурная *(ещё не подключён)*
- **WebAudio** — весь звук синтезируется, файлов нет *(ещё не подключён)*
- **Capacitor 8** — упаковка в Android APK, appId `com.family.facerunner`
- **GitHub Actions** — сборка APK и публикация в Releases

## Сборка

```bash
npm run dev      # разработка в браузере
npm run build    # сборка веб-части в dist/
npm run sync     # build + cap sync android
```

Требуется **Node 22+** и **JDK 21**. JDK 17 не подойдёт: `capacitor-android` компилируется с `sourceCompatibility JavaVersion.VERSION_21`.

### Локальная сборка APK

```bash
cd android && ./gradlew assembleDebug
```

⚠️ На этой машине в `~/.gradle/gradle.properties` глобально прописан `org.gradle.java.home` с JDK 17 (нужен другим проектам). Для этого проекта его надо перебить, иначе сборка падает с `invalid source release: 21`:

```bash
./gradlew assembleDebug -Dorg.gradle.java.home=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

В CI этой проблемы нет — там чистый раннер.

### APK на телефон

Пуш в `main` запускает [android.yml](.github/workflows/android.yml): сборка debug APK, публикация в Release с тегом `build-<номер>`. Скачать с телефона: **[Releases](https://github.com/maybeNekit/face-runner/releases)**.

APK подписан отладочным ключом — ставится сайдлоадом, Play Store не нужен.

### Полноэкранный режим

Ландшафт и скрытие системных панелей заданы нативно: `sensorLandscape` в [AndroidManifest.xml](android/app/src/main/AndroidManifest.xml) и immersive-режим через `WindowInsetsControllerCompat` в [MainActivity.java](android/app/src/main/java/com/family/facerunner/MainActivity.java). На targetSdk 36 старые флаги (`android:windowFullscreen`, `SYSTEM_UI_FLAG_*`) не работают — только этот путь.

Папка `android/` коммитится в репозиторий: без неё `cap sync` в CI не найдёт проект.

## Правила проекта

Все обязательные правила живут в скилле [face-runner-rules](.claude/skills/face-runner-rules/SKILL.md). Читай его перед любой задачей по коду, ассетам, звуку, производительности или сборке. Коротко:

1. **Только код** — никаких скачанных моделей, спрайтов, шрифтов и звуковых файлов
2. **60 FPS на среднем Android** — не более 300 draw calls, пул объектов, в игровом цикле ничего не создаётся
3. **Фото никогда не покидает устройство** — ноль сетевых запросов, ноль аналитики, ноль внешних API
4. **Юмор детский и добрый** — никакой крови, страха и насилия
5. **Сначала браузер, потом APK**

## Сабагенты

- [game-feel-tuner](.claude/agents/game-feel-tuner.md) — ощущение от игры: прыжок, гравитация, тряска камеры, частицы, кривая сложности, правило «juice»
- [build-doctor](.claude/agents/build-doctor.md) — сборка: Gradle, Capacitor sync, GitHub Actions, версии Node/Java
- [kid-ux-checker](.claude/agents/kid-ux-checker.md) — проверка интерфейса глазами ребёнка 6–10 лет

## Настройки

[.claude/settings.json](.claude/settings.json) — модель `opusplan`, уровень усилий `high`.
