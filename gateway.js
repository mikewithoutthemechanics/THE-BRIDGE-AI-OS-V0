const express = require("express");
const app = express();

app.use(express.json());

// simple block endpoint
app.post("/block", (req, res) => {
  console.log("BLOCK TRIGGERED");
  res.send("ok");
});

// basic route
app.get("/", (req, res) => {
  res.send("ok");
});

app.listen(3000, () => {
  console.log("GATEWAY RUNNING ON 3000");
});

app.get("/bans", async (req,res)=>{
  const { createClient } = require("@supabase/supabase-js");
  require("dotenv").config();

  const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data } = await s.from("bans").select("*");

  res.json(data);
});
