require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

(async () => {
  const { error } = await supabase.from("events").insert({
    ts: new Date().toISOString(),
    type: "auth",
    value: 1,
    meta: "/test"
  });

  if (error) console.log("ERR:", error.message);
  else console.log("TEST SENT");
})();
