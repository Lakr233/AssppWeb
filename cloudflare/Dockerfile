# Keep this file in sync with /Dockerfile.
# Cloudflare Wrangler validates `containers[].image` relative to the cloudflare/ project.
# We set `image_build_context` to `..` so COPY paths still resolve from repo root.
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS backend-build
RUN apk add --no-cache python3 make g++
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./
COPY --from=frontend-build /app/frontend/dist ./public
RUN mkdir -p /data/packages
EXPOSE 8080
ENV DATA_DIR=/data PORT=8080
CMD ["node", "dist/index.js"]
