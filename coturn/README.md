# coturn

`turnserver.conf` is mounted by `env.py` as `/etc/coturn/turnserver.conf`.

Defaults are injected from `env.py` command args (`--realm`, `--user`).

Current deployment path:
- External client connects `turns:turn.<domain>:443?transport=tcp`
- Nginx `stream` routes SNI `turn.<domain>` to coturn internal TLS port `5349`
- Coturn remains internal to Docker (not host-published)

The container starts as root so coturn can read the root-owned Let's Encrypt private key mounted read-only into the container.

For production, replace default TURN credentials in `env.py`.
