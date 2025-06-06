certbot certonly \
  --dns-route53 \
  --config-dir ./config \
  --work-dir ./work \
  --logs-dir ./logs \
  --non-interactive \
  --agree-tos \
  --email julian@codecollective.us \
  -d app.codecollective \
  -d *.app.codecollective

cp certs/config/live/codecollective.us/*.pem .

