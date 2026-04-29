import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(express.json());

const db = new Pool({
  connectionString: "postgresql://postgres:postgres@bridge-ai-os-aoe-dromedaries-db-1:5432/postgres"
});

async function waitForDB(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      await db.query("SELECT 1");
      console.log("DB READY");
      return;
    } catch {
      console.log("DB WAIT...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error("DB FAIL");
}

async function activateUser(email, amount, source) {
  const existing = await db.query(
    "SELECT id FROM payments WHERE source=$1 AND email=$2 AND amount=$3",
    [source, email, amount]
  );

  if (existing.rows.length > 0) {
    console.log("SKIP DUPLICATE:", email);
    return;
  }

  await db.query(
    "INSERT INTO payments(email, amount, source, status) VALUES($1,$2,$3,'completed')",
    [email, amount, source]
  );

  await db.query(
    `INSERT INTO users(email, active, credits)
     VALUES($1, true, 100)
     ON CONFLICT (email)
     DO UPDATE SET active=true, credits=users.credits+100`,
    [email]
  );

  console.log("ACTIVATED:", email);
}

app.post("/api/webhooks/payfast", async (req, res) => {
  const d = req.body;
  if (d.payment_status === "COMPLETE") {
    await activateUser(d.email_address, d.amount_gross, "payfast");
  }
  res.sendStatus(200);
});

app.get("/", (_,res)=>res.send("OK"));

waitForDB().then(() => {
  app.listen(4000, () => console.log("CORE LIVE"));
});
