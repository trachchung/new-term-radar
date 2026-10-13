# Built by wrangler from cloudflare/wrangler.toml (build context = this directory).
# config.json is not in git (see .gitignore); create it from config.example.json first.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 APP_DIR=/app WORK_DIR=/tmp/work
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY radar ./radar
COPY config.json ./config.json
COPY cloudflare/server.py ./server.py

EXPOSE 8080
CMD ["python", "server.py"]
