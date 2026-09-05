# Build context is the repository root, not web/, so the build can install from
# the workspace's single pnpm-lock.yaml. A second lockfile inside web/ used to
# drift from the root one, which meant the image was built from different
# dependency versions than local development resolved.

# ---- builder: install the workspace and build the app -----------------------
FROM node:24-alpine AS builder

WORKDIR /repo
RUN corepack enable

# Manifests first so the dependency layer is cached independently of source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json web/.npmrc* web/
RUN pnpm install --frozen-lockfile --config.minimum-release-age=0

COPY web web

# Public Firebase web config, baked into the client bundle at build time.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID
ENV NODE_ENV=production

RUN pnpm --filter web build

# ---- runtime: production dependencies and the build output only -------------
FROM node:24-alpine AS runtime

WORKDIR /repo
RUN corepack enable
ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json web/.npmrc* web/

# Public Firebase web config, needed at runtime for custom-token exchange.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID
ENV VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID
# --prod drops every devDependency, and the workspace root's own devDependencies
# (firebase-tools) never reach the image.
RUN pnpm install --frozen-lockfile --prod --filter web --config.minimum-release-age=0

COPY --from=builder /repo/web/build web/build

# server.ts resolves build/client and build/server relative to the working
# directory, so the server runs from web/.
WORKDIR /repo/web

EXPOSE 3000

CMD ["pnpm", "start"]
