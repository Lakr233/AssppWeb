# Build stages run on the build machine's native architecture (BUILDPLATFORM)
# and produce platform-independent artifacts; only the runtime layer is built
# per target platform. This keeps linux/386 builds as cheap as amd64/arm64.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Produces dist/ (pure JS) plus a full node_modules used by the asset
# extraction stage below. This node_modules is NOT copied into the runtime
# image: native binaries (napi) must match the target platform, which is
# installed there per-arch instead.
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Downloads the public Apple update package once (~380 MB over range
# requests), verifies the pinned digests, strips fat binaries to their x86_64
# slices, and emits ~22.5 MB of assets. Docker layer caching makes this a
# no-op on rebuilds unless the pinned digests change.
FROM --platform=$BUILDPLATFORM node:20-alpine AS sap-assets
WORKDIR /app/backend
COPY --from=backend-build /app/backend ./
ARG SAP_ASSETS_OUT=/out
RUN DATA_DIR=/tmp/sap-extract-work node --import tsx scripts/extract-sap-assets.mts ${SAP_ASSETS_OUT}

FROM node:20-alpine
RUN apk add --no-cache zip
WORKDIR /app
COPY --from=backend-build /app/backend/dist ./dist
COPY backend/package*.json ./
# Native modules (e.g. @node-rs/crc32 via yauzl-promise) ship prebuilt napi
# binaries per platform; installing here picks the target arch automatically.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=frontend-build /app/frontend/dist ./public
COPY --from=sap-assets /out /opt/asspp/sap-assets
RUN mkdir -p /data/packages
EXPOSE 8080
ARG BUILD_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV DATA_DIR=/data PORT=8080 BUILD_COMMIT=$BUILD_COMMIT BUILD_DATE=$BUILD_DATE
CMD ["node", "dist/index.js"]
