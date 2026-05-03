# signaling

Simple WebSocket signaling server for WebRTC offers/answers/ICE candidate exchange.

Protocol:
- Client receives `hello` with `peerId` and ICE config.
- Client sends `{ "type": "join", "roomId": "..." }`.
- Client sends `{ "type": "signal", "targetPeerId": "...", "payload": { ... } }`.
- Server relays `signal` messages to peers in the room.

Runtime env comes from `env.py` service definition:
- `PORT`
- `ALLOWED_ORIGINS`
- `STUN_URLS`
- `TURN_URLS`
- `TURN_USERNAME`
- `TURN_CREDENTIAL`

Current default TURN path uses `turns:turn.<domain>:443?transport=tcp` via nginx stream SNI routing.
