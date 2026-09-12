FROM node:22-bookworm-slim AS node-runtime
WORKDIR /deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
FROM python:3.12-slim-bookworm
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /deps/node_modules /app/node_modules
RUN useradd --create-home --uid 1000 node
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=node:node package.json *.mjs ./
COPY --chown=node:node databento_worker.py es_profile.py ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
