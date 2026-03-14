FROM node:22-alpine AS deps

WORKDIR /app

COPY apps/web/package.json /app/package.json
RUN npm install

FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules /app/node_modules
COPY apps/web/ /app/

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/.next/standalone /app/
COPY --from=builder /app/.next/static /app/.next/static

EXPOSE 3000

CMD ["node", "server.js"]
