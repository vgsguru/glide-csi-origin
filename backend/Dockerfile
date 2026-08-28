# Glide backend — Flask + SQLAlchemy.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud hosts inject $PORT. Two workers with a long timeout: a gemma4 call can
# legitimately take 30s+, and a short timeout would kill it mid-answer.
ENV PORT=8080
EXPOSE 8080
CMD exec gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 8 --timeout 300 "app.main:app"
