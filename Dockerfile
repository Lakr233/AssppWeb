# Build stages run on the build machine's native architecture (BUILDPLATFORM)
# and produce platform-independent artifacts; only the runtime layer is built
# per target platform. This keeps linux/386 builds as cheap as amd64/arm64.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Produces dist/ (pure JS). This stage's node_modules is NOT copied into the
# runtime image: native binaries (napi) must match the target platform, which
# is installed there per-arch instead.
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache zip
WORKDIR /app
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/package*.json ./
# Native modules install per target platform: @node-rs/crc32 (via
# yauzl-promise) ships prebuilt napi binaries, but bufferutil (via wisp-js)
# has no linux-arm64-musl prebuild and falls back to source compilation.
# The toolchain is added and removed inside one layer, so it never bloats
# the final image.
RUN apk add --no-cache --virtual .node-build python3 make g++ \
    && npm ci --omit=dev \
    && apk del .node-build \
    && npm cache clean --force
COPY --from=frontend-build /app/frontend/dist ./public
RUN mkdir -p /data/packages
EXPOSE 8080
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV DATA_DIR=/data PORT=8080 BUILD_COMMIT=$BUILD_COMMIT BUILD_DATE=$BUILD_DATE
CMD ["node", "dist/index.js"]
