#!/bin/sh
# init-temporary-keys.sh
# Initialize temporary keys for use with a KAS

USAGE="Usage:  ${CMD:=${0##*/}} [(-v|--verbose)] [-H|--hsm] [-o|--output <path>]"

# helper functions
exit2() {
  printf >&2 "%s:  %s: '%s'\n%s\n" "$CMD" "$1" "$2" "$USAGE"
  exit 2
}
check() { { [ "$1" != "$EOL" ] && [ "$1" != '--' ]; } || exit2 "missing argument" "$2"; }

opt_output="."

# parse command-line options
set -- "$@" "${EOL:=$(printf '\1\3\3\7')}" # end-of-list marker
while [ "$1" != "$EOL" ]; do
  opt="$1"
  shift
  case "$opt" in
    -v | --verbose) opt_verbose='true' ;;
    -h | --help)
      printf "%s\n" "$USAGE"
      exit 0
      ;;
    -o | --output)
      check "$1" "-o|--output"
      opt_output="$1"
      shift
      ;;
    # process special cases
    -[A-Za-z0-9] | -*[!A-Za-z0-9]*) exit2 "invalid option" "$opt" ;;
  esac
done
shift

if [ "$opt_verbose" = true ]; then
  set -x
fi

# ENTROPY FIX: Set environment variables to use non-blocking entropy
export RANDFILE=/dev/urandom
export OPENSSL_CONF=/dev/null

# Install entropy tools if in CI environment
if [ "$IN_GITHUB_ACTIONS" = "true" ]; then
  echo "GitHub Actions detected - ensuring entropy availability"
  # Try to install haveged for better entropy (ignore errors)
  sudo apt-get update >/dev/null 2>&1 || true
  sudo apt-get install -y haveged >/dev/null 2>&1 || true
  sudo systemctl start haveged >/dev/null 2>&1 || true
  
  # Generate some entropy by creating random data
  echo "Generating initial entropy..."
  dd if=/dev/urandom of=/tmp/entropy_seed bs=1024 count=1 >/dev/null 2>&1 || true
fi

mkdir -p "$opt_output"

echo "Generating KAS RSA certificate..."
openssl req -x509 -nodes -newkey RSA:2048 -subj "/CN=kas" \
  -keyout "$opt_output/kas-private.pem" \
  -out "$opt_output/kas-cert.pem" \
  -days 365 \
  -rand /dev/urandom

echo "Generating EC parameters..."
openssl ecparam -name prime256v1 >ecparams.tmp

echo "Generating KAS EC certificate..."
openssl req -x509 -nodes -newkey ec:ecparams.tmp -subj "/CN=kas" \
  -keyout "$opt_output/kas-ec-private.pem" \
  -out "$opt_output/kas-ec-cert.pem" \
  -days 365 \
  -rand /dev/urandom

mkdir -p keys

echo "Generating Keycloak CA certificate..."
openssl req -x509 -nodes -newkey RSA:2048 -subj "/CN=ca" \
  -keyout keys/keycloak-ca-private.pem \
  -out keys/keycloak-ca.pem \
  -days 365 \
  -rand /dev/urandom

echo "Creating certificate configuration files..."
printf "subjectAltName=DNS:localhost,IP:127.0.0.1" > keys/sanX509.conf
printf "[req]\ndistinguished_name=req_distinguished_name\n[req_distinguished_name]\n[alt_names]\nDNS.1=localhost\nIP.1=127.0.0.1" > keys/req.conf

echo "Generating localhost certificate request..."
openssl req -new -nodes -newkey rsa:2048 \
  -keyout keys/localhost.key \
  -out keys/localhost.req \
  -batch -subj "/CN=localhost" \
  -config keys/req.conf \
  -rand /dev/urandom

echo "Signing localhost certificate..."
openssl x509 -req -in keys/localhost.req \
  -CA keys/keycloak-ca.pem \
  -CAkey keys/keycloak-ca-private.pem \
  -CAcreateserial \
  -out keys/localhost.crt \
  -days 3650 -sha256 \
  -extfile keys/sanX509.conf

echo "Generating sample user certificate request..."
openssl req -new -nodes -newkey rsa:2048 \
  -keyout keys/sampleuser.key \
  -out keys/sampleuser.req \
  -batch -subj "/CN=sampleuser" \
  -rand /dev/urandom

echo "Signing sample user certificate..."
openssl x509 -req -in keys/sampleuser.req \
  -CA keys/keycloak-ca.pem \
  -CAkey keys/keycloak-ca-private.pem \
  -CAcreateserial \
  -out keys/sampleuser.crt \
  -days 3650

echo "Creating PKCS12 keystore..."
openssl pkcs12 -export \
  -in keys/keycloak-ca.pem \
  -inkey keys/keycloak-ca-private.pem \
  -out keys/ca.p12 \
  -nodes \
  -passout pass:password

echo "Converting to JKS keystore using Docker..."
docker run \
    -v $(pwd)/keys:/keys \
    --entrypoint keytool \
    --user $(id -u):$(id -g) \
    keycloak/keycloak:25.0 \
    -importkeystore \
    -srckeystore /keys/ca.p12 \
    -srcstoretype PKCS12 \
    -destkeystore /keys/ca.jks \
    -deststoretype JKS \
    -srcstorepass "password" \
    -deststorepass "password" \
    -noprompt

# Clean up temporary files
rm -f ecparams.tmp keys/*.req keys/*.conf

echo "Certificate generation completed successfully!"