#!/bin/sh
# Ajusta a pasta /data para o usuário sem privilégios e inicia como ele.
set -e
chown -R "${PUID}:${PGID}" /data
chmod 700 /data
exec setpriv --reuid="${PUID}" --regid="${PGID}" --clear-groups \
  uvicorn main:app --host 0.0.0.0 --port 8080 --no-server-header \
  --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-127.0.0.1}"
