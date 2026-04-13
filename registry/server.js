// registry/server.js
const express = require("express");
const app = express();
app.use(express.json());

const services = {};

app.post("/register", (req, res) => {
  const { name, url } = req.body;
  services[name] = { url, ts: Date.now() };
  res.json({ ok: true });
});

app.get("/services", (req, res) => {
  res.json(services);
});

app.get("/health", (_, res) => res.send("OK"));

app.listen(9000, () => console.log("Registry running on 9000"));
