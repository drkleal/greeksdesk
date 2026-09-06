FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --chown=node:node package.json basis.mjs chart-context.mjs server.mjs providers.mjs analysis.mjs ./
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
