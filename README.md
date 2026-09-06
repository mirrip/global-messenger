# 🌐 Global Messenger

Высокодоступный, бессерверный PWA-мессенджер на основе сегментированного облачного хранилища **Google Apps Script**, **Google Sheets** и **Google Drive** с поддержкой передачи файлов до **1 ТБ**.

## 🚀 Архитектурные особенности

1. **3 шардированные таблицы данных**:
   - `Global Messenger — Auth & Accounts` (`1GyA9M_eQ0bdZzDYTP7dlkwjkLnLJEsWvM-bYg4O9ogk`)
   - `Global Messenger — Hot Messages` (`1WesvVOUgneIPSDfG5BYgTzA1I0uRdjtsOCPdvclquv8`)
   - `Global Messenger — Archive & Heavy Media Index` (`1k_dOYWoqxODKnp1mWLVpkO_y5g1tY5Nbd7dP0K2zuv8`)
2. **Мгновенная доставка (RAM Cache)**:
   - Использование Apps Script `CacheService` для синхронизации сообщений за 100–250 мс без блокировок чтения таблиц.
3. **Безопасность**:
   - Авторизация на основе HMAC-SHA256 с динамической солью каждого пользователя и серверным секретом (`AUTH_PEPPER`).
4. **Передача файлов любого размера (до 1 ТБ)**:
   - Потоковая чанкованная передача (Resumable Streams) в Google Drive без переполнения таблиц.
5. **Офлайн-устойчивость (Outbox Queue)**:
   - Локальная очередь сообщений в PWA: при потере сети сообщения не теряются и отправляются сразу после восстановления связи.
6. **Web Push & PWA**:
   - Установка на рабочий стол и телефон (Android PWA, iOS 16.4+).

## 🛠 Развернутый бэкенд
- **Web App URL**: `https://script.google.com/macros/s/AKfycbwxGP9V8FLse_ZGzcCl-hwSWNUiOXpwdNCBRpqnrfe8iBNQz-u9aLjB6bf0TPFpyKpyJw/exec`
- **Версия API**: `v1.0.0`
