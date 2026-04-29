// terminal/server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 5002 });

wss.on("connection", (ws) => {
  ws.send("Distributed Terminal Connected");
  ws.on("message", (msg) => {
    ws.send(`ECHO: ${msg}`);
  });
});

console.log("Terminal WS on 5002");
