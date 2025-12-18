certbot certonly \
  --dns-route53 \
  --config-dir ./config \
  --work-dir ./work \
  --logs-dir ./logs \
  --non-interactive \
  --agree-tos \
  --email julian@codecollective.us \
  -d app.arkavo \
  -d *.app.arkavo

cp certs/config/live/codecollective.us/*.pem .

