require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("? Missing Supabase env");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

(async () => {
  try {
    const { error } = await supabase.from("events").insert({
      ts: new Date().toISOString(),
      type: "auth",
      value: 1,
      meta: "/test"
    });

    if (error) {
      console.error("? Insert failed:", error.message);
    } else {
      console.log("? TEST EVENT SENT");
    }
  } catch (err) {
    console.error("? Error:", err.message);
  }
})();
