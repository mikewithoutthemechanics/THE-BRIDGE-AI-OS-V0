// bridge/server.js
const express = require("express");
const app = express();

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post("/route", (req, res) => {
  res.json({ routed: true });
});

app.listen(8000, () => console.log("Bridge running on 8000"));
