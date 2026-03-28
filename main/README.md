# Main

Центральный reverse proxy на `Traefik` с `Let's Encrypt`.

- `gallery.<domain>` публикуется labels у `gallery/nginx`
- `id.<domain>` публикуется labels у `id/nginx`
- `pass.<domain>` публикуется labels у `pass/vaultwarden`
- TLS выпускается через ACME `httpChallenge`
- Общая сеть остаётся `common` через `${TRAEFIK_COMMON_NETWORK:-common}`

Для продакшна в `main/.env` нужен только настоящий `LE_EMAIL`.
