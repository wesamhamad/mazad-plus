# مزاد+ — one container: build the React frontend, serve it and the API from Flask.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /web/dist frontend/dist
ENV PORT=8080 MAZAD_AUTOBOOT=1 PYTHONUNBUFFERED=1
EXPOSE 8080
WORKDIR /app/backend
# one worker: SQLite + in-process SSE bus + auction runner share one process
CMD ["sh", "-c", "gunicorn -w 1 --threads 16 -k gthread --timeout 120 -b 0.0.0.0:${PORT} app:app"]
