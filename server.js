const express = require('express');
const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended:true }));

// STATIC (frontend + dashboard)
app.use(express.static(__dirname + '/public'));

// ROOT
app.get('/', (req,res)=>res.redirect('/onboarding.html'));

// ===== API (NO CORS NEEDED) =====
app.post('/api/auth/register',(req,res)=>{
  res.json({
    status:"registered",
    user:req.body,
    ts:Date.now()
  });
});

// ===== ONESHOT FUNNEL =====
app.get('/go', (req,res)=>res.redirect('/system-status-dashboard.html'));

app.use('/go/save.php', (req,res)=>res.status(204).end());

app.use('/go/r.php', (req,res)=>res.redirect('https://ai-os.co.za'));

// HEALTH
app.get('/health',(req,res)=>res.json({status:"OK"}));

// STATUS
app.get('/api/status',(req,res)=>{
  res.json({
    system:"BRIDGE AI OS",
    port:PORT,
    routes:[
      "/",
      "/onboarding.html",
      "/system-status-dashboard.html",
      "/api/auth/register",
      "/go",
      "/go/save.php",
      "/go/r.php"
    ]
  });
});

app.listen(PORT, ()=>console.log("UNIFIED RUNNING ? http://localhost:"+PORT));
