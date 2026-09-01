# syntax=docker/dockerfile:1

# The TypeScript compiler and the type packages are build-time only; shipping
# them would roughly double the image for no runtime benefit.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci || npm install
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a change to source does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Compiled output, with the views and static files copied in beside it.
COPY --from=build /app/dist ./dist

# node:alpine ships a "node" user; running as root in a container that faces
# the internet buys nothing.
USER node

EXPOSE 3000
ENV PORT=3000

# The app answers /healthz by round-tripping a query, so this reports the
# database being unreachable rather than only the process being alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
