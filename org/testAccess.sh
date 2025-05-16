curl -k -X POST https://localhost/keycloak/auth/realms/opentdf/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=opentdf" \
  -d "client_secret=secret"

echo ""
echo "-----------"
echo ""

curl -k -X POST https://localhost/keycloak/auth/realms/opentdf/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=admin-cli" \
  -d "client_secret=changeme"

echo ""
echo "-----------"
echo ""

curl -k -X POST https://localhost/keycloak/auth/realms/master/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=admin" \
  -d "client_secret=changeme"

echo ""
echo "-----------"
echo ""

curl -k -X POST https://localhost/keycloak/auth/realms/opentdf/protocol/openid-connect/token \
  -d "grant_type=client_credentials" \
  -d "client_id=org-backend" \
  -d "client_secret=Bbp4vaK2I81U8EgmTQKKmJc7MU6lH1Hu"


