# syntax=docker/dockerfile:1

# Single Node version for local dev, CI, and build (matches .nvmrc).
# Everything runs in these containers so the only host requirement is Docker.

# --- deps: install dependencies once, cached on the lockfile ---
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- dev: toolchain + source; used for the dev server, tests, lint, build ---
FROM node:20-slim AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 5173 = Vite dev server, 4173 = Vite preview
EXPOSE 5173 4173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: produce the static site into /app/dist ---
FROM dev AS build
RUN npm run build

# --- serve: production-like static preview of the built PWA via nginx ---
FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
