FROM node:24.15.0-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311
RUN apk upgrade --no-cache && apk add --no-cache python3 ca-certificates && mkdir -p /tmp/nginx /srv/frontend && chown -R 10001:10001 /tmp/nginx /srv/frontend /etc/nginx
COPY --from=build /build/dist/beauty-manager/browser/ /srv/frontend/
COPY deployment/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deployment/entrypoint.py /app/entrypoint.py
USER 10001:10001
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:${PORT}/health || exit 1
ENTRYPOINT ["python3","/app/entrypoint.py"]
