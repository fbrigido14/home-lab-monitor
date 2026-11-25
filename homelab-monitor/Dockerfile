FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    CONFIG_PATH=/data/config.yml DB_PATH=/data/homelab.db PUID=1000 PGID=1000
WORKDIR /srv
COPY app/requirements.txt .
# instala as dependências e remove o pip da imagem final (menos superfície de ataque)
RUN pip install --no-cache-dir -r requirements.txt \
 && pip uninstall -y pip setuptools wheel 2>/dev/null; mkdir /data

COPY app ./app
COPY web ./web
COPY config.example.yml ./config.example.yml
COPY entrypoint.sh /entrypoint.sh
RUN chmod 555 /entrypoint.sh && chmod -R a-w /srv
WORKDIR /srv/app
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=40s \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/api/health')" || exit 1
ENTRYPOINT ["/entrypoint.sh"]
