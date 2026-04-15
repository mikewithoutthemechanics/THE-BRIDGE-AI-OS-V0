import React from 'react';
import { Link } from 'react-router-dom';

export default function Marketplace() {
  return (
    <div className="bg-surface selection:bg-primary selection:text-on-primary min-h-screen">
      {/* TopNavBar Shell */}
      <nav className="fixed top-0 w-full z-50 glass-nav flex justify-between items-center px-12 py-6 shadow-[0_20px_60px_rgba(255,255,255,0.06)]">
        <div className="text-xl font-bold tracking-[0.1em] text-[#aac7ff] uppercase">ORCHESTRA</div>
        <div className="hidden md:flex items-center space-x-10 font-['Inter'] tracking-tight">
          <Link className="text-[#aac7ff] border-b-2 border-[#aac7ff] pb-1 font-semibold" to="/">A2A</Link>
          <Link className="text-[#39393b] hover:text-[#aac7ff] transition-colors duration-300" to="/admin">H2A</Link>
          <Link className="text-[#39393b] hover:text-[#aac7ff] transition-colors duration-300" to="/docs">Human API</Link>
        </div>
        <div className="flex items-center space-x-6">
          <button className="material-symbols-outlined text-[#aac7ff] hover:bg-[#2a2a2c] p-2 rounded-full transition-all">hub</button>
          <button className="material-symbols-outlined text-[#aac7ff] hover:bg-[#2a2a2c] p-2 rounded-full transition-all">terminal</button>
          <div className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant/20">
            <img alt="User node avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDEqhESTtK6yQvO7niz1Mx5EGafdz4LLWOrp3HS5e8PCZMJ3b_anvZmmV9y66C5WqHeK_3zMnpOpleeLsPt0LgLrJPxlEK_hxJKBXs9DMdQCZFFPIMVnV9PABw3G4gYzq6lu-QaOzh-Dv4P6O_CfGF4M2wMz5ZgRzhAbjkE6WxF_KOHnxSG0YlDl_F83PNW1zGjnSzA-QffmbImi9z6uO7zb8Ik4Z__YvxmcuhwEQ8bBft5-ejXPDcdIgwz1VO5CFo5tunzf4ZUFnA" />
          </div>
        </div>
      </nav>

      {/* SideNavBar Shell */}
      <aside className="fixed left-0 top-0 w-72 h-screen bg-[#1f1f21] rounded-r-[48px] flex flex-col p-6 z-40 pt-32 hidden lg:flex">
        <div className="mb-10 px-4">
          <h2 className="text-[#aac7ff] font-black tracking-wider uppercase text-sm">Protocol v4.2</h2>
          <p className="text-xs text-outline font-['Inter'] uppercase tracking-widest mt-1">Network: Optimal</p>
        </div>
        <nav className="flex-grow space-y-2">
          <Link className="flex items-center space-x-4 px-4 py-3 bg-[#2a2a2c] text-[#aac7ff] rounded-xl transition-all" to="/">
            <span className="material-symbols-outlined">lan</span>
            <span className="font-['Inter'] text-xs font-bold tracking-[0.1em] uppercase">Nodes</span>
          </Link>
          <Link className="flex items-center space-x-4 px-4 py-3 text-[#39393b] hover:text-white hover:bg-[#39393b] transition-all rounded-xl" to="/engine">
            <span className="material-symbols-outlined">sync_alt</span>
            <span className="font-['Inter'] text-xs font-bold tracking-[0.1em] uppercase">Exchanges</span>
          </Link>
          <Link className="flex items-center space-x-4 px-4 py-3 text-[#39393b] hover:text-white hover:bg-[#39393b] transition-all rounded-xl" to="/loop">
            <span className="material-symbols-outlined">speed</span>
            <span className="font-['Inter'] text-xs font-bold tracking-[0.1em] uppercase">Latency</span>
          </Link>
          <Link className="flex items-center space-x-4 px-4 py-3 text-[#39393b] hover:text-white hover:bg-[#39393b] transition-all rounded-xl" to="/master">
            <span className="material-symbols-outlined">account_balance</span>
            <span className="font-['Inter'] text-xs font-bold tracking-[0.1em] uppercase">Governance</span>
          </Link>
        </nav>
        <div className="mt-auto space-y-6">
          <button className="w-full py-4 m2-glow-button rounded-xl text-on-primary font-bold uppercase tracking-widest text-xs">
            Deploy Node
          </button>
          <div className="border-t border-outline-variant/10 pt-6">
            <Link className="flex items-center space-x-4 px-4 py-3 text-[#39393b] hover:text-white transition-all" to="/admin">
              <span className="material-symbols-outlined">settings</span>
              <span className="font-['Inter'] text-xs font-bold tracking-[0.1em] uppercase">Settings</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Canvas */}
      <main className="lg:ml-72 pt-32 px-8 pb-12">
        {/* Hero Section & Filters */}
        <header className="mb-16">
          <div className="max-w-4xl">
            <h1 className="text-display-lg text-6xl font-bold tracking-tight mb-6 text-on-surface leading-none">
              NEURAL <span className="text-primary">EXCHANGE</span>
            </h1>
            <p className="text-body-lg text-xl text-outline-variant leading-relaxed max-w-2xl">
              Autonomous agent orchestration layer. Trade intelligence fragments, raw GPU clusters, and semantic logic gates in real-time.
            </p>
          </div>
          {/* Asymmetrical Filter Layout */}
          <div className="mt-12 flex flex-wrap gap-4 items-center">
            <button className="px-8 py-3 bg-surface-container-high text-primary rounded-full font-bold text-xs uppercase tracking-widest border border-primary/20">
              All Agents
            </button>
            <button className="px-8 py-3 bg-surface-container text-outline hover:text-on-surface transition-colors rounded-full font-bold text-xs uppercase tracking-widest">
              Compute Nodes
            </button>
            <button className="px-8 py-3 bg-surface-container text-outline hover:text-on-surface transition-colors rounded-full font-bold text-xs uppercase tracking-widest">
              Logic Engines
            </button>
            <button className="px-8 py-3 bg-surface-container text-outline hover:text-on-surface transition-colors rounded-full font-bold text-xs uppercase tracking-widest">
              Data Synthesizers
            </button>
            <div className="ml-auto flex items-center bg-surface-container-lowest rounded-full px-6 py-2 border border-outline-variant/10">
              <span className="material-symbols-outlined text-outline-variant mr-3 text-sm">search</span>
              <input className="bg-transparent border-none focus:ring-0 text-sm text-on-surface w-48 uppercase tracking-widest outline-none" placeholder="Query Node ID..." type="text" />
            </div>
          </div>
        </header>

        {/* Bento Grid: Marketplace Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {/* Agent Card 1: Compute Node */}
          <div className="obsidian-card p-8 rounded-xl flex flex-col border border-outline-variant/5">
            <div className="flex justify-between items-start mb-10">
              <div className="w-16 h-16 bg-surface-container-high rounded-lg flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>memory</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-outline uppercase tracking-widest mb-1">Status</div>
                <div className="flex items-center text-emerald-400 text-xs font-bold uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></span> Active
                </div>
              </div>
            </div>
            <h3 className="text-headline-lg text-2xl font-bold mb-2">AXON-7 HEAVY</h3>
            <p className="text-outline-variant text-sm mb-8 leading-relaxed">High-density L40S cluster optimized for recursive transformer training and large-scale synthesis.</p>
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Latency</div>
                <div className="text-lg font-mono text-primary font-bold">14ms</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Reliability</div>
                <div className="text-lg font-mono text-primary font-bold">99.98%</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Token Cost</div>
                <div className="text-lg font-mono text-primary font-bold">0.0012Φ</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Throughput</div>
                <div className="text-lg font-mono text-primary font-bold">1.2 TB/s</div>
              </div>
            </div>
            <button className="mt-auto w-full py-4 bg-surface-container-high text-on-surface font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-surface-bright transition-all">
              Initiate Handshake
            </button>
          </div>

          {/* Agent Card 2: Logic Engine */}
          <div className="obsidian-card p-8 rounded-xl flex flex-col border border-outline-variant/5">
            <div className="flex justify-between items-start mb-10">
              <div className="w-16 h-16 bg-surface-container-high rounded-lg flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-outline uppercase tracking-widest mb-1">Status</div>
                <div className="flex items-center text-primary text-xs font-bold uppercase">
                  <span className="w-2 h-2 rounded-full bg-primary mr-2"></span> Processing
                </div>
              </div>
            </div>
            <h3 className="text-headline-lg text-2xl font-bold mb-2">SYNTH-LOGIC v4</h3>
            <p className="text-outline-variant text-sm mb-8 leading-relaxed">Specialized Boolean resolution engine for multi-agent consensus and complex decision trees.</p>
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Latency</div>
                <div className="text-lg font-mono text-primary font-bold">42ms</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Reliability</div>
                <div className="text-lg font-mono text-primary font-bold">100%</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Token Cost</div>
                <div className="text-lg font-mono text-primary font-bold">0.0450Φ</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Inference</div>
                <div className="text-lg font-mono text-primary font-bold">8.4k r/s</div>
              </div>
            </div>
            <button className="mt-auto w-full py-4 bg-surface-container-high text-on-surface font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-surface-bright transition-all">
              Initiate Handshake
            </button>
          </div>

          {/* Protocol Feed / Transactions (Special Card) */}
          <div className="obsidian-card rounded-xl border border-outline-variant/5 overflow-hidden flex flex-col xl:row-span-2">
            <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-[0.2em]">Protocol Feed</h3>
              <span className="material-symbols-outlined text-primary animate-pulse">sensors</span>
            </div>
            <div className="flex-grow p-6 space-y-6 overflow-y-auto no-scrollbar protocol-feed-gradient">
              <div className="flex items-start space-x-4 border-l-2 border-primary/20 pl-4 py-1">
                <div className="text-[10px] font-mono text-outline-variant">14:22:01</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-on-surface">Node_882 → Node_102</div>
                  <div className="text-[10px] text-primary mt-1 uppercase">Transfer: 12.4GB Logic Fragment</div>
                </div>
              </div>
              <div className="flex items-start space-x-4 border-l-2 border-emerald-400/20 pl-4 py-1">
                <div className="text-[10px] font-mono text-outline-variant">14:21:58</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-on-surface">Consensus reached</div>
                  <div className="text-[10px] text-emerald-400 mt-1 uppercase">Block #88,291 Validated</div>
                </div>
              </div>
              <div className="flex items-start space-x-4 border-l-2 border-primary/20 pl-4 py-1">
                <div className="text-[10px] font-mono text-outline-variant">14:21:44</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-on-surface">Agent_Orion → AXON-7</div>
                  <div className="text-[10px] text-primary mt-1 uppercase">Allocating: 200 Teraflops</div>
                </div>
              </div>
              <div className="flex items-start space-x-4 border-l-2 border-error/20 pl-4 py-1">
                <div className="text-[10px] font-mono text-outline-variant">14:21:30</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-error">Latency Spike Detected</div>
                  <div className="text-[10px] text-error mt-1 uppercase">Node_441 Rerouting...</div>
                </div>
              </div>
              <div className="flex items-start space-x-4 border-l-2 border-primary/20 pl-4 py-1">
                <div className="text-[10px] font-mono text-outline-variant">14:21:12</div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-on-surface">Data_Synth → Archive_Alpha</div>
                  <div className="text-[10px] text-primary mt-1 uppercase">Commit: 1.4PB Vector Data</div>
                </div>
              </div>
            </div>
            <div className="p-6 bg-surface-container-high/50 text-center">
              <button className="text-[10px] font-bold text-outline uppercase tracking-widest hover:text-primary transition-colors">View Network Map</button>
            </div>
          </div>

          {/* Agent Card 3: Data Synthesizer */}
          <div className="obsidian-card p-8 rounded-xl flex flex-col border border-outline-variant/5">
            <div className="flex justify-between items-start mb-10">
              <div className="w-16 h-16 bg-surface-container-high rounded-lg flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>dataset</span>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-outline uppercase tracking-widest mb-1">Status</div>
                <div className="flex items-center text-emerald-400 text-xs font-bold uppercase">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></span> Online
                </div>
              </div>
            </div>
            <h3 className="text-headline-lg text-2xl font-bold mb-2">VECTOR-STREAM</h3>
            <p className="text-outline-variant text-sm mb-8 leading-relaxed">Real-time embedding generation for financial streams and global geopolitical sentiment analysis.</p>
            <div className="grid grid-cols-2 gap-6 mb-10">
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Latency</div>
                <div className="text-lg font-mono text-primary font-bold">110ms</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Reliability</div>
                <div className="text-lg font-mono text-primary font-bold">98.2%</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Token Cost</div>
                <div className="text-lg font-mono text-primary font-bold">0.0004Φ</div>
              </div>
              <div>
                <div className="text-[10px] text-outline uppercase tracking-widest mb-1">Vectors/s</div>
                <div className="text-lg font-mono text-primary font-bold">2M+</div>
              </div>
            </div>
            <button className="mt-auto w-full py-4 bg-surface-container-high text-on-surface font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-surface-bright transition-all">
              Initiate Handshake
            </button>
          </div>

          {/* Dashboard Preview / Network Status */}
          <div className="obsidian-card p-8 rounded-xl border border-outline-variant/5 bg-gradient-to-br from-surface-container to-surface-container-high overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="text-headline-lg text-xl font-bold mb-6">Global Sync State</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-outline font-medium">Nodes Connected</span>
                  <span className="font-mono text-on-surface">1,429,002</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-[88%]"></div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-outline font-medium">Total TFLOPs</span>
                  <span className="font-mono text-on-surface">420.4 EB</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-[65%]"></div>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-outline font-medium">Market Liquidity</span>
                  <span className="font-mono text-on-surface">9.2B Φ</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-[94%]"></div>
                </div>
              </div>
              <div className="mt-8 pt-8 border-t border-outline-variant/10 flex items-center space-x-4">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-variant overflow-hidden">
                    <img alt="User 1" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7U3zMQuR5IN6zl5FSj0jUS0yzcFmTkscded8C6czlMwZ19s3EeO-zfW7LsgmzGqCJOu84fTdZgti6E4gUGdNmxp9PI62cZgB3q1t-1_UPDk20b3886yGWq2Ty7eNRWjl35aWnfxqA-pBActRVTi0VeFsxYumE4bBlX8OrAO5ZdKj-BZHZAZN-41u3UgRnh7T0i2B2o2Miwb1mq8KZwchn3WzwIQMT433ZpwX6fy87z4e7aWWqgpSp7z1tB6aH_o8trWEtokOlqdw" />
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-variant overflow-hidden">
                    <img alt="User 2" src="https://lh3.googleusercontent.com/aida-public/AB6AXuASy2VedffkBGdx1vS6giGVJn0S4O5YsB8kwyMfTP4ZCIQKTITgPLLfeuVSz7h88x5NMTW17CSb64RLY-jl9KqC_wXw-bu4cB6OmRasjPX-L1TH4xCNGegYgcOfOWqtTnMgXdx8fE9ax9AF3YEwtEG3wP-MfnnNrJ03o3CYTSxAcwXSNci646WbBS2HirMmW6u1Z2VZ7WrLrbQoMoeh8HM6tzsTH_Y_EP8u74Rd6EoW874r7Ke8yvol8Qtyii5lOKBtXCE0EjWDEDg" />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-outline uppercase tracking-widest">+1.2k Active Dealers</span>
              </div>
            </div>
            {/* Abstract Silicon Background Texture */}
            <div className="absolute -right-10 -bottom-10 opacity-10 pointer-events-none">
              <span className="material-symbols-outlined text-[200px]" style={{ fontVariationSettings: "'wght' 100" }}>grid_view</span>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="md:hidden fixed bottom-0 w-full bg-surface/90 backdrop-blur-xl flex justify-around items-center py-4 z-50 border-t border-outline-variant/10">
        <button className="flex flex-col items-center space-y-1 text-primary">
          <span className="material-symbols-outlined">lan</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">A2A</span>
        </button>
        <button className="flex flex-col items-center space-y-1 text-outline">
          <span className="material-symbols-outlined">sync_alt</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Swap</span>
        </button>
        <button className="flex flex-col items-center space-y-1 text-outline">
          <span className="material-symbols-outlined">terminal</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Exec</span>
        </button>
        <button className="flex flex-col items-center space-y-1 text-outline">
          <span className="material-symbols-outlined">account_balance_wallet</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Node</span>
        </button>
      </nav>
    </div>
  );
}