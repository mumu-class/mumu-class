#!/usr/bin/env bash
# 在暫時的本機 Postgres 上套用 migration 並執行 supabase/tests/*.sql。
# 需要 Homebrew 的 postgresql（initdb、pg_ctl、psql）。不需要 Docker。
set -euo pipefail
export LC_ALL="${PG_LOCALE:-en_US.UTF-8}" LANG="${PG_LOCALE:-en_US.UTF-8}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$(mktemp -d)"; SOCK="$(mktemp -d /tmp/pgsock.XXXX)"; PORT=54329
trap 'pg_ctl -D "$DATA" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DATA" "$SOCK"' EXIT
initdb -D "$DATA" -U postgres -A trust --no-locale -E UTF8 >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$DATA/log" -w start >/dev/null
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" <<'SQL'
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant usage on schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on sequences to authenticated;
SQL
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
for f in "$ROOT"/supabase/tests/*.sql; do "${PSQL[@]}" -f "$f"; done
