require("dotenv").config();

const express = require("express");
const autoKill = require("./auto-kill");

const app = express();

app.use(express.json());

// ✅ APPLY AUTO-KILL HERE
app.use(autoKill);

// block endpoint (called by alert-engine)
app.post("/block", (req, res) => {
  console.log("BLOCK TRIGGERED");
  res.send("ok");
});

// test route
app.get("/", (req, res) => {
  res.send("ok");
});

// view bans
app.get("/bans", async (req, res) => {
  const { createClient } = require("@supabase/supabase-js");

  const s = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { data } = await s.from("bans").select("*");
  res.json(data);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`GATEWAY RUNNING ON ${PORT}`);
});