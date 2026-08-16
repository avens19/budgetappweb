# syntax=docker/dockerfile:1
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a change to source does not re-resolve the tree.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

# node:alpine ships a "node" user; running as root in a container that faces
# the internet buys nothing.
USER node

EXPOSE 3000
ENV PORT=3000

# The app answers /healthz by round-tripping a query, so this reports the
# database being unreachable rather than only the process being alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
