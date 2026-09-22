# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app

RUN addgroup -S maple && adduser -S maple -G maple

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY src ./src
COPY migrations ./migrations
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000

USER maple

EXPOSE 3000

# Migrations run on boot and the first seed can take a few seconds, so the
# start period is generous. node is already in the image; wget is not guaranteed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
