FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

ENV DATABASE_URL=postgresql://postgres:postgres@arkavousersdb/postgres
ENV KEYCLOAK_URL=https://keycloak.app.codecollective.us/auth
ENV KEYCLOAK_REALM=arkavo
ENV KEYCLOAK_CLIENT_ID=users-api

EXPOSE 8000

CMD ["uvicorn", "users_api:app", "--host", "0.0.0.0", "--port", "8000"]
