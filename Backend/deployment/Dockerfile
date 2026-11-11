FROM python:3.14.10-alpine3.23@sha256:0cdfadc8472de8f74a5d3c6e5e49d1b3f059f36cd01a0a0d4015cb1cb89df436 AS build
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.14.10-alpine3.23@sha256:0cdfadc8472de8f74a5d3c6e5e49d1b3f059f36cd01a0a0d4015cb1cb89df436 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 DJANGO_SETTINGS_MODULE=config.settings.production DJANGO_ENV=production
RUN apk upgrade --no-cache && apk add --no-cache tzdata libpq
RUN addgroup -g 10001 beauty && adduser -D -u 10001 -G beauty beauty
COPY --from=build /install /usr/local
WORKDIR /app
COPY apps apps
COPY negocio negocio
COPY config config
COPY deployment deployment
COPY scripts scripts
COPY tests tests
COPY docs/openapi.json docs/openapi.json
COPY manage.py requirements.txt ./
RUN python deployment/collect_static.py && mkdir -p /app/backups && chown -R 10001:10001 /app/staticfiles /app/backups
# Remove installer and bundled build dependencies from the web runtime attack surface.
RUN rm -rf /usr/local/lib/python3.14/site-packages/pip* /usr/local/lib/python3.14/ensurepip /usr/local/bin/pip*
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 CMD python deployment/healthcheck.py
ENTRYPOINT ["python", "deployment/entrypoint.py"]
