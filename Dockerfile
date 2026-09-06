FROM node:22-bookworm-slim AS node-runtime
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
RUN useradd --create-home --uid 1000 node
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=node:node package.json *.mjs ./
COPY --chown=node:node databento_worker.py ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
