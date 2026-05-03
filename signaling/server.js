import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const iceConfigPayload = {
  stun: (process.env.STUN_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  turn: (process.env.TURN_URLS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  username: process.env.TURN_USERNAME || "",
  credential: process.env.TURN_CREDENTIAL || "",
};

const wss = new WebSocketServer({ port });
const rooms = new Map();

function sendToPeer(roomId, targetPeerId, payload) {
  const room = rooms.get(roomId);
  if (!room) {
    return false;
  }
  const target = [...room].find((member) => member.peerId === targetPeerId);
  if (!target || target.readyState !== target.OPEN) {
    return false;
  }
  target.send(JSON.stringify(payload));
  return true;
}

function broadcast(roomId, payload, excludeClient = null) {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }
  const encoded = JSON.stringify(payload);
  for (const member of room) {
    if (member === excludeClient || member.readyState !== member.OPEN) {
      continue;
    }
    member.send(encoded);
  }
}

function leaveRoom(client) {
  if (!client.roomId) {
    return;
  }
  const room = rooms.get(client.roomId);
  if (room) {
    room.delete(client);
    if (room.size === 0) {
      rooms.delete(client.roomId);
    } else {
      broadcast(client.roomId, {
        type: "peer-left",
        peerId: client.peerId,
      });
    }
  }
  client.roomId = "";
}

wss.on("connection", (ws, req) => {
  const origin = req.headers.origin || "";
  if (allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
    ws.close(1008, "Origin not allowed");
    return;
  }

  ws.peerId = randomUUID();
  ws.roomId = "";
  ws.send(
    JSON.stringify({
      type: "hello",
      peerId: ws.peerId,
      ice: iceConfigPayload,
    }),
  );

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString("utf-8"));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (msg.type === "join") {
      if (!msg.roomId || typeof msg.roomId !== "string") {
        ws.send(JSON.stringify({ type: "error", message: "roomId required" }));
        return;
      }
      leaveRoom(ws);
      ws.roomId = msg.roomId;
      if (!rooms.has(msg.roomId)) {
        rooms.set(msg.roomId, new Set());
      }
      const room = rooms.get(msg.roomId);
      room.add(ws);
      ws.send(
        JSON.stringify({
          type: "joined",
          roomId: msg.roomId,
          peers: [...room].filter((p) => p !== ws).map((p) => p.peerId),
        }),
      );
      broadcast(msg.roomId, { type: "peer-joined", peerId: ws.peerId }, ws);
      return;
    }

    if (!ws.roomId) {
      ws.send(JSON.stringify({ type: "error", message: "join a room first" }));
      return;
    }

    if (msg.type === "signal") {
      const payload = {
        type: "signal",
        fromPeerId: ws.peerId,
        targetPeerId: msg.targetPeerId || null,
        payload: msg.payload || {},
      };
      if (msg.targetPeerId) {
        if (!sendToPeer(ws.roomId, msg.targetPeerId, payload)) {
          ws.send(JSON.stringify({ type: "error", message: "target peer not found" }));
        }
      } else {
        broadcast(ws.roomId, payload, ws);
      }
      return;
    }

    ws.send(JSON.stringify({ type: "error", message: "unknown message type" }));
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });

  ws.on("error", () => {
    leaveRoom(ws);
  });
});

console.log(`Signaling server listening on :${port}`);
