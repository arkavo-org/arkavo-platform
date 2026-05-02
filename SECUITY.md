# Security: Encryption at Rest and in Transit

This document assesses whether the current Arkavo platform implementation satisfies an "encryption at rest and in transit" requirement for personally identifiable information (PII), identity data, financial records, credentials, uploaded artifacts, and related sensitive system data.

## Summary

The current implementation partially satisfies encryption-in-transit requirements, but it does not yet fully satisfy a complete encryption-at-rest and encryption-in-transit requirement for PII.

Covered today:

- Public web traffic is intended to terminate through nginx over HTTPS/TLS.
- CockroachDB is running in secure mode for the OrgPortal/org/UBI/wages path, using TLS client certificates.
- User passwords are hashed rather than stored as plaintext.
- PIdP `identity_data` now supports transparent application-level JSON encryption when `PII_ENCRYPTION_KEYS` is configured.
- Existing PIdP `users.identity_data` and `website_users.identity_data` rows have been migrated to encrypted JSONB wrappers in the live `pidpdb` database.
- PIdP startup fails closed in production, or when `REQUIRE_PII_ENCRYPTION=true`, if `PII_ENCRYPTION_KEYS` is missing.
- PIdP avatar/object writes request S3 server-side encryption by default.
- Org business-card S3 writes request server-side encryption by default.

Not fully covered today:

- PIdP still appears to use its own Postgres path rather than the secure CockroachDB path.
- Internal service-to-service traffic commonly uses plain HTTP on the Docker network.
- There is no repository evidence that CockroachDB, Postgres, MinIO, or Docker volumes are encrypted at rest.
- Future unencrypted PIdP `identity_data` rows can still occur only if a database is restored from an older backup or written by code that bypasses the PIdP model layer.
- Object storage server-side encryption still depends on the backing S3/MinIO server being configured to honor the requested algorithm.
- Some generated private keys may be serialized without passphrase encryption depending on deployment path.

## Data Classes

The following data should be treated as sensitive:

- Account identifiers, names, email addresses, phone numbers, addresses, and profile data.
- PIdP identity records, identity JSON, account linkage data, and authentication metadata.
- Biometric or biometric-adjacent data, including iris identity data or templates if introduced.
- Financial account balances, UBI payments, wage payments, tax payments, transaction history, and treasury records.
- Business and nonprofit registration records.
- Uploaded documents, avatars, business cards, card OCR output, and stored artifacts.
- Authentication credentials, password hashes, JWT signing keys, TLS private keys, API tokens, and database credentials.

## Current Encryption in Transit

### Public Web Traffic

The nginx configuration is designed to redirect HTTP to HTTPS and serve TLS using TLS 1.2 or TLS 1.3. This is appropriate for public browser-to-platform traffic when valid certificates are provisioned and nginx is the public entry point.

Status: partially satisfied.

Required evidence:

- Confirm production DNS terminates only through HTTPS.
- Confirm valid certificates are deployed and renewed.
- Confirm HTTP redirects to HTTPS for every public host.
- Confirm HSTS is enabled for production hosts where appropriate.

### Database Transport

CockroachDB is running in secure mode for the OrgPortal/org/UBI/wages path. Services use TLS certificate parameters such as `sslmode=verify-full`, `sslrootcert`, `sslcert`, and `sslkey`.

Status: satisfied for the Cockroach-backed services that use this connection path.

Remaining gap:

- PIdP appears to remain on a separate Postgres path, and no TLS evidence has been established for that path.

### Internal Service Traffic

nginx-to-app and app-to-app traffic commonly uses plain HTTP inside the Docker network. This may be acceptable only if the security model explicitly treats the Docker network and host as trusted. It does not satisfy a strict "encryption in transit everywhere PII moves" requirement.

Status: not fully satisfied.

Best-practice target:

- Use internal TLS or mTLS for PII-bearing service-to-service traffic.
- At minimum, require TLS for database, object storage, authentication, and identity-provider traffic.

### Object Storage Transport

MinIO/S3-style object storage now defaults client configuration to SSL where supported. If an explicit `http://` endpoint is configured, traffic may still be internal HTTP. If PII-bearing uploads are stored or retrieved over HTTP, this does not satisfy strict encryption-in-transit requirements.

Status: partially satisfied by defaults, not fully proven.

Best-practice target:

- Use HTTPS/TLS for S3-compatible object storage endpoints.
- Prefer private network access plus TLS rather than private network access alone.

## Current Encryption at Rest

### CockroachDB

CockroachDB secure mode protects transport and node/client authentication. It does not, by itself, prove encryption at rest.

Status: not proven.

Best-practice target:

- Enable CockroachDB enterprise encryption at rest where available, or run CockroachDB on encrypted host/cloud volumes.
- Document the storage-layer control used, including key ownership, rotation, backup encryption, and recovery process.

### PIdP Postgres

PIdP appears to use a separate Postgres database path. No evidence currently proves that the Postgres data volume is encrypted at rest.

Status: not satisfied unless the host or volume is externally encrypted and documented.

Best-practice target:

- Move PIdP onto the secure CockroachDB instance, or enable TLS and encrypted storage for Postgres.
- Encrypt the underlying Postgres data volume with LUKS, ZFS native encryption, encrypted cloud block storage, or equivalent.
- Ensure database backups are encrypted separately from the live volume.

### PII Fields

PIdP `identity_data` uses transparent encrypted JSONB storage when `PII_ENCRYPTION_KEYS` is configured. New writes are stored as encrypted JSON wrappers while the application continues to receive normal dictionaries. Existing live rows were migrated using `migrate_encrypt_identity_data.py`.

Status: satisfied for live PIdP `identity_data`; not yet complete for every high-sensitivity PII field outside PIdP identity JSON.

Best-practice target:

- Complete field-level envelope encryption for all high-sensitivity PII.
- Encrypt identity JSON, biometric or iris-related values, addresses, sensitive profile attributes, document metadata, and OCR outputs.
- Store only deterministic blind indexes for fields that need lookup.
- Keep encryption keys outside the database.
- Support key rotation and re-encryption.

### Object Storage and Artifacts

Uploaded artifacts, profile assets, business cards, and document-like content may contain PII. There is no current evidence that these objects are encrypted at rest beyond any host-level storage controls.

PIdP avatar writes and org business-card S3 writes request `ServerSideEncryption=AES256` by default. This is an application-level request to the object store; compliance still requires confirming MinIO/S3 accepts, enforces, and persists encrypted objects.

Status: partially satisfied by client-side request, not fully proven at storage layer.

Best-practice target:

- Enable MinIO server-side encryption with KMS-backed keys, or encrypt objects client-side before upload.
- Ensure bucket policies prevent public reads by default.
- Encrypt object backups and replication targets.

### Credentials and Private Keys

Password hashing is present and appropriate for user passwords. However, generated private keys may be serialized without passphrase encryption depending on code path and deployment configuration.

Status: partially satisfied.

Best-practice target:

- Store private keys as mounted secrets with strict file permissions.
- Prefer encrypted private keys or a managed secret store.
- Do not store signing keys, TLS private keys, database credentials, or API tokens in git.
- Ensure certificates, `.crt`, `.key`, `.pem`, generated artifacts, and local secrets remain ignored by git.

## Required Controls for Compliance

To satisfy a strict encryption-at-rest and encryption-in-transit requirement, the platform should implement and document the following controls.

### Transport Controls

- HTTPS/TLS for all public browser/API traffic.
- TLS or mTLS for internal service-to-service traffic that carries PII.
- TLS for all database connections.
- TLS for object storage connections.
- TLS certificate validation enabled, not disabled.
- No plaintext credentials, tokens, identity records, or financial data transmitted over public or shared networks.

### Storage Controls

- Encrypted database volumes for CockroachDB and any remaining Postgres instances.
- Encrypted object storage for MinIO/S3 artifacts.
- Encrypted backups, snapshots, exports, and replication targets.
- Field-level encryption for high-sensitivity PII.
- Keys stored outside the database and outside the application repository.
- Key rotation and emergency key revocation procedure.

### Secret Controls

- No `.crt`, `.key`, `.pem`, database dumps, generated artifacts, or local secret files committed to git.
- Secrets mounted at runtime from a secret manager, encrypted file store, or protected host path.
- Private keys stored with restrictive permissions.
- Production secrets separated from development secrets.

### Audit Controls

- Document every PII store and whether it is encrypted at rest.
- Document every PII transport path and whether it is encrypted in transit.
- Log administrative access to PII and key material.
- Avoid logging plaintext PII, tokens, private keys, or credentials.
- Regularly test that plaintext secret and certificate artifacts are ignored by git.

## Recommended Implementation Plan

1. Move PIdP account and identity data onto the secure CockroachDB instance, or enable TLS and encrypted storage for its Postgres instance.
2. Enable encrypted host, cloud, or database volumes for CockroachDB, Postgres, MinIO, and backups.
3. Confirm MinIO/S3 server-side encryption is enforced and cannot be bypassed by clients.
4. Extend field-level encryption to any additional high-sensitivity PII outside PIdP `identity_data`, especially biometric, document, and OCR-derived values.
5. Add TLS or mTLS for internal PII-bearing service traffic.
6. Store JWT signing keys, TLS keys, database credentials, and API tokens through a runtime secret mechanism rather than repository files.
7. Extend `.gitignore` rules to reject certificates, keys, dumps, generated artifacts, and local runtime state.
8. Add an automated secret scan and artifact scan to CI.
9. Create a control matrix that maps each PII data store and transport path to the exact encryption mechanism used.

## Compliance Position

Until the missing controls are implemented and documented, the platform should be described as:

> Public TLS and secure CockroachDB transport are partially implemented. Full encryption at rest and complete encryption in transit for all PII are not yet proven.

The platform should not be represented as fully satisfying encryption-at-rest and encryption-in-transit requirements for PII until storage encryption, internal transport encryption, object-store enforcement, and field-level protection for all high-sensitivity identity data are completed or explicitly accepted as risk exceptions.
