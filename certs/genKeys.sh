#!/bin/bash

# Exit on any error
set -e

# Install OpenSSL (for Alpine-based systems)
apk add --no-cache openssl

# Create certs directory
mkdir -p /certs

# Create CA key
openssl genrsa -out ca.key 2048

# Create CA certificate (self-signed)
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
    -subj "/C=US/ST=CA/L=Local/O=MyOrg/CN=MyCA" -out ca.crt

# Create server key
openssl genrsa -out privkey.pem 2048

# Create CSR for server certificate using the SAN config
openssl req -new -key privkey.pem -config openssl.cnf -out server.csr

# Sign the server CSR with the CA key and certificate
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -days 365 -sha256 -extfile openssl.cnf -extensions req_ext -out server.crt

# Combine server cert and CA cert into a full chain
cat server.crt ca.crt > fullchain.pem

# Set permissions
chmod 644 privkey.pem server.crt fullchain.pem ca.crt

# Combine the certificates with the standard trust store
cat /etc/sslca-certificates.crt ca.crt server.crt > all-ca-certificates.crt

echo "Certificates generated and stored in all-ca-certificates.crt"
