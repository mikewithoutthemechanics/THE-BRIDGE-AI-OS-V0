import fs from "fs";
import path from "path";
import EventEmitter from "events";

// =========================================================
// GLOBAL BUS (STATE + SIGNAL PROPAGATION)
// =========================================================
class Bus extends EventEmitter {
    emitState(event) {
        this.emit("state", {
            ts: Date.now(),
            ...event
        });
    }
}

const bus = new Bus();

// =========================================================
// ENGINE CORE (DISCOVER + ADOPT + EXECUTE)
// =========================================================
export class SVGEngine {
    constructor({ skillPath }) {
        this.skillPath = skillPath;
        this.skills = new Map();
    }

    discover() {
        return fs.readdirSync(this.skillPath)
            .filter(f => f.endsWith(".skill.js"))
            .map(f => path.join(this.skillPath, f));
    }

    async load() {
        for (const file of this.discover()) {
            const mod = await import(file + "?t=" + Date.now());
            const skill = mod.default;

            if (skill?.id) {
                this.skills.set(skill.id, this.wrap(skill));
            }
        }
    }

    // WRAP SKILL → INJECT TELEMETRY
    wrap(skill) {
        return {
            ...skill,
            run: (input = {}) => {
                const start = Date.now();

                bus.emitState({ type: "start", skill: skill.id });

                const out = skill.run(input);

                const latency = Date.now() - start;

                bus.emitState({
                    type: "end",
                    skill: skill.id,
                    latency,
                    output: out
                });

                return out;
            }
        };
    }

    execute(id, input = {}) {
        return this.skills.get(id)?.run(input);
    }

    teach(id, input = {}) {
        const skill = this.skills.get(id);
        if (!skill) return "<svg></svg>";

        return skill.visualize(input);
    }

    list() {
        return Array.from(this.skills.keys());
    }
}

// =========================================================
// LIVE SVG RENDERER (STATE → VISUAL)
// =========================================================
export class SVGRealtime {
    constructor() {
        this.state = [];
        bus.on("state", s => this.state.push(s));
    }

    render() {
        const events = this.state.slice(-10);

        let x = 50;

        const nodes = events.map(e => {
            const color = e.type === "start" ? "#ffaa00" : "#00ff88";
            const label = `${e.skill || ""}`;

            const node = `
                <g>
                    <rect x="${x}" y="80" width="120" height="50" rx="8"
                          fill="#0a0a0a" stroke="${color}"/>
                    <text x="${x+10}" y="105" fill="${color}">${label}</text>
                    <text x="${x+10}" y="120" fill="#888">${e.type}</text>
                </g>
            `;

            x += 140;
            return node;
        }).join("");

        return `
        <svg width="1000" height="200" xmlns="http://www.w3.org/2000/svg">
            ${nodes}
        </svg>
        `;
    }
}

// =========================================================
// AUTO LOOP (EXECUTION + TEACHING FEEDBACK)
// =========================================================
export async function boot() {
    const engine = new SVGEngine({ skillPath: "./skills" });
    const viz = new SVGRealtime();

    await engine.load();

    console.log("Skills:", engine.list());

    // CONTINUOUS EXECUTION LOOP
    setInterval(() => {
        for (const id of engine.list()) {
            engine.execute(id, {});
        }
    }, 2000);

    // SVG OUTPUT LOOP
    setInterval(() => {
        const svg = viz.render();
        fs.writeFileSync("./live.svg", svg);
    }, 1000);
}

boot();
