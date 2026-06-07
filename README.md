# avry-zeroclaw

AI Agent deployment service for the Aivory platform — autonomous agents on Telegram, Slack, and WhatsApp.

## Tech Stack

- Python 3.11+
- FastAPI + Uvicorn
- Multi-channel messaging (Telegram, Slack, WhatsApp)
- Docker

## Directory Structure

```
avry-zeroclaw/
├── app/            # Application source code
├── main.py         # Entry point
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

## Run Locally

```bash
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

## Docker

```bash
docker compose up --build
```

## VPS Deployment

```bash
docker compose -f docker-compose.yml up -d --build
```

Ensure `.env` is configured on the server with production credentials.

## Part of Aivory

This service is part of the [Aivory platform](https://github.com/ClementHansel/aivory).
