# Bouwt de frontend en draait de server. Werkt op Render, Railway, Fly.io, ...
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
RUN mkdir -p /data
EXPOSE 3001
CMD ["node", "--max-old-space-size=400", "server/index.js"]
