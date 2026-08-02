# iLoveRepost - TikTok Repost Finder

Encontra reposts no TikTok de qualquer perfil, filtrando por palavra-chave.

## Deploy no Render (GRATIS)

1. Cria conta em [render.com](https://render.com) (gratis)
2. New Web Service -> Build and deploy from a Git repository
3. Cola o link do teu GitHub repo
4. Render detecta o `Dockerfile` automaticamente
5. Clica Create Web Service
6. Espera 5-10 minutos (instala o Playwright)

## Funcionalidades

- Interface web moderna e responsiva
- Pesquisa por username + palavra-chave
- Detecao de reposts (descricoes similares)
- Resultados em tempo real com barra de progresso
- Blindado: user-agents rotativos, stealth mode, delays aleatorios

## Stack

- **Backend**: Flask + Playwright + Playwright-Stealth
- **Frontend**: HTML/CSS/JS puro
- **Hosting**: Render (Docker)

## Variaveis de Ambiente (opcional)

| Variavel | Descricao | Exemplo |
|----------|-----------|---------|
| `SECRET_KEY` | Chave secreta Flask | `minha-chave-secreta` |
| `PROXIES` | Lista de proxies (virgula) | `http://proxy1:8080` |

## Como Usar

1. Abre o site (Render da-te um link tipo `iloverepost.onrender.com`)
2. Coloca o username do TikTok (ex: `khaby.lame`)
3. Coloca a palavra-chave (ex: `love`)
4. Clica em "Procurar Reposts"
5. Espera a barra de progresso
6. Ve os reposts encontrados!

## Aviso

O TikTok bloqueia scraping. Esta ferramenta usa:
- Stealth mode (esconde que e bot)
- User-agents rotativos
- Delays aleatorios
- Proxy support

Mas se o TikTok mudar o layout ou reforcar anti-bot, pode parar de funcionar.

## Licenca

MIT
