# Vaultwarden behind Traefik

1. In the root project, start `main/docker-compose.yaml` so Traefik creates `${TRAEFIK_COMMON_NETWORK}` (default: `common`) and publishes `80/443`.
2. In this folder, copy `.env.example` to `.env` and set real values.
   Ensure backup directory is writable for the container:
   `mkdir -p backups && chmod 775 backups`
3. Start Vaultwarden from this folder:
   `docker compose up -d`

## Email (SMTP)

- SMTP can be configured from `.env` (variables prefixed with `VAULTWARDEN_SMTP_`).
- Required fields for most providers: host, from address, port, security, username, password.
- Defaults are set for a common STARTTLS setup (`port=587`, `security=starttls`).
- Optional field `VAULTWARDEN_SMTP_AUTH_MECHANISM` can be set to `Plain`, `Login`, or `Xoauth2` if your provider requires it.
- After changes, restart Vaultwarden:
  `docker compose up -d`
- You can verify mail delivery from Vaultwarden admin panel (`/admin` -> SMTP test).

## Database backups

- A dedicated `backup` service creates compressed SQLite backups every night.
- Backup files are saved to `./backups` as `db-YYYYmmdd-HHMMSS.sqlite3.gz`.
- Retention is dynamic:
  - keep 60 days when backup size is at or below `VAULTWARDEN_BACKUP_SIZE_THRESHOLD_MB`;
  - keep 30 days when backup size is above that threshold.
- Configure schedule and retention in `.env`:
  - `VAULTWARDEN_BACKUP_SCHEDULE` (default `0 3 * * *`, every night at 03:00);
  - `VAULTWARDEN_BACKUP_RETENTION_LONG_DAYS` (default `60`);
  - `VAULTWARDEN_BACKUP_RETENTION_SHORT_DAYS` (default `30`);
  - `VAULTWARDEN_BACKUP_SIZE_THRESHOLD_MB` (default `100`).
- Set retention to `0` to keep only the latest backup and remove all previous archives on each run.

## Security notes

- No host ports are exposed; access is only through the central Traefik HTTPS router.
- Admin panel is disabled by default (`VAULTWARDEN_DISABLE_ADMIN_TOKEN=true`).
- For admin access, set `VAULTWARDEN_DISABLE_ADMIN_TOKEN=false` and use a hashed token in `VAULTWARDEN_ADMIN_TOKEN`.
- `/admin` is protected by `ipAllowList` via `VAULTWARDEN_ADMIN_ALLOW_IPS`.
- Container hardening is enabled: `read_only`, `tmpfs /tmp`, `cap_drop: [ALL]`, `no-new-privileges`.
