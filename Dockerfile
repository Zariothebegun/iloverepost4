# Imagem oficial do Playwright: ja traz o Chromium + todas as libs do sistema
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
