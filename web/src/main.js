import "./style.css";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

async function pingHealth(el) {
  try {
    const r = await fetch(`${apiBase}/health`, { credentials: "same-origin" });
    const txt = await r.text();
    el.textContent = r.ok ? txt : `HTTP ${r.status}`;
    el.className = "pill " + (r.ok ? "ok" : "bad");
  } catch (e) {
    el.textContent = e instanceof Error ? e.message : String(e);
    el.className = "pill bad";
  }
}

document.querySelector("#app").innerHTML = `
  <header class="hdr">
    <div class="logo">Bridge AI OS</div>
    <div class="sub">Frontend build · VPS-ready</div>
  </header>
  <main class="main">
    <section class="card">
      <h2>Runtime</h2>
      <p class="muted">Same-origin proxied routes in prod: <code>/health</code>, <code>/api/*</code> → bridge API container.</p>
      <dl class="facts">
        <dt>Frontend</dt><dd id="fv"></dd>
        <dt>API <code>/health</code></dt><dd><span id="hi" class="pill">…</span></dd>
      </dl>
    </section>
    <section class="card">
      <h2>VPS quick links</h2>
      <ul class="links">
        <li><a href="./">Dashboard (this app)</a></li>
        <li><a href="/health" target="_blank" rel="noopener">/health (JSON)</a></li>
      </ul>
    </section>
  </main>
  <footer class="ft">
    <span>Repository: <a href="https://github.com/bridgeaios/THE-BRIDGE-AI-OS-V0" rel="noopener">THE-BRIDGE-AI-OS-V0</a></span>
  </footer>
`;

document.getElementById("fv").textContent = `v${import.meta.env.VITE_APP_VERSION ?? "dev"}`;
pingHealth(document.getElementById("hi"));
