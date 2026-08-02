# ILOVEREPOST

Minimal TikTok repost retriever built in `HTML/CSS/JS` plus:
- a Node backend for repost search and downloads
- a FastAPI backend for Stripe + Supabase billing

## What it does

- Accepts a TikTok username.
- Resolves the user's `secUid` from TikTok profile hydration data.
- Calls TikTok's internal web endpoints.
- Supports cursor pagination.
- Filters videos by keyword in the caption.
- Returns normalized JSON for the frontend.

## Run locally

```bash
node src/server.js
```

Then open `http://localhost:3000`.

## Billing backend

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

Run the FastAPI billing server:

```bash
python -m uvicorn main:app --reload
```

The billing backend runs on `http://127.0.0.1:8000` by default.

Set these environment variables before starting it:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-supabase-key"
$env:SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
$env:STRIPE_SECRET_KEY="your-stripe-secret-key"
$env:STRIPE_PRICE_ID="your-price-id"
$env:STRIPE_WEBHOOK_SECRET="your-stripe-webhook-secret"
$env:CHECKOUT_SUCCESS_URL="http://localhost:3000/success"
$env:CHECKOUT_CANCEL_URL="http://localhost:3000/cancel"
python -m uvicorn main:app --reload
```

The frontend's `Upgrade to Pro` and `Sign Up` buttons call `POST /create-checkout-session` on the FastAPI server.

## API

- `GET /api/plans`
- `POST /api/account/plan?plan=free|pro`
- `GET /api/reposts?username=tiktok&keyword=storm&cursor=0&count=16`
- `GET /api/download?url=https://www.tiktok.com/@user/video/123`

## Billing API

- `GET /`
- `GET /health`
- `POST /create-checkout-session`
- `POST /stripe-webhook`

## Frontend source copy

To copy the original v0/Next frontend source repo into this workspace without installing its dependencies:

```bash
node tools/sync-frontend-source.mjs
```

The downloaded source lands in `frontend-source/v0-iloverepost-frontend-build/`.

## Notes

- `reposts` is implemented.
- Downloading reposted videos is exposed through a public TikTok downloader approach.
- Search plans are still local placeholders in the Node app until full auth/subscription sync is connected.
- Stripe webhooks must be configured in your Stripe dashboard so `checkout.session.completed` reaches the FastAPI backend.
