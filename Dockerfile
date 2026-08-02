FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
RUN npm install --omit=dev

RUN npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
