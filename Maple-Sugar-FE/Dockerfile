# syntax=docker/dockerfile:1

# Build stage. Vite inlines VITE_* values at build time, so the API location
# has to be supplied here rather than at container start.
FROM node:22-alpine AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ARG VITE_API_MODE=http
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_API_MODE=$VITE_API_MODE

RUN npm run build

# Serve stage. nginx:alpine runs fine on the Raspberry Pi 5 under Debian.
FROM nginx:alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html

# Landing in templates/ (rather than conf.d/) makes the image's entrypoint run
# envsubst over it before nginx starts, so the API host is a runtime setting.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/security-headers.conf

# Override to point at a backend elsewhere: -e API_UPSTREAM=http://10.0.0.5:3000
ENV API_UPSTREAM=http://api:3000

# Opt in to the image populating NGINX_LOCAL_RESOLVERS from /etc/resolv.conf.
# The proxy block needs a resolver to look the backend up per request, and
# reading it from resolv.conf works on both bridge and user-defined networks.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 80

# Pinned to 127.0.0.1 rather than localhost so the probe does not depend on
# how the container resolves localhost between IPv4 and IPv6.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
