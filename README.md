# iLoveRepost - TikTok Repost Finder

Encontra reposts no TikTok de qualquer perfil, filtrando por palavra-chave.

## Stack

- **Backend**: Node.js + Express + Playwright (Chromium)
- **Frontend**: HTML/CSS/JS puro (`public/index.html`)
- **Hosting**: Render (Docker)

## Correr localmente

```bash
npm install
npx playwright install --with-deps chromium
npm start
# abre http://localhost:3000
```

## Deploy no Render

1. New Web Service -> Build and deploy from a Git repository
2. Cola o link deste repo
3. Render deteta o `Dockerfile` (base `mcr.microsoft.com/playwright`, ja traz o Chromium)
4. Create Web Service e espera pelo build

O `render.yaml` ja define plano free, `PORT=3000` e health check em `/health`.

## Endpoints

| Metodo | Rota | Descricao |
|--------|------|-----------|
| `POST` | `/api/fetch-reposts` | Body: `{ "username": "khaby.lame", "keyword": "love", "scrolls": 2 }` |
| `GET`  | `/api/download?url=...` | Download do video sem marca de agua (via tikwm) |
| `GET`  | `/health` | Health check |

## Variaveis de ambiente

| Variavel | Descricao | Default |
|----------|-----------|---------|
| `PORT` | Porta do servidor | `3000` |

## Aviso

O TikTok bloqueia scraping. Se mudarem o layout ou reforcarem o anti-bot,
a ferramenta pode deixar de funcionar. No plano free do Render o servico
adormece por inatividade e o primeiro pedido demora mais.

## Licenca

MIT
