'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

// C64 16-color palette
const C = {
  black:      '#000000',
  white:      '#FFFFFF',
  red:        '#883932',
  cyan:       '#67B6BD',
  purple:     '#8B3F96',
  green:      '#55A049',
  blue:       '#40318D',
  yellow:     '#BFCE72',
  orange:     '#8B5429',
  brown:      '#574200',
  lightRed:   '#B86962',
  darkGrey:   '#505050',
  grey:       '#787878',
  lightGreen: '#94E089',
  lightBlue:  '#7869C4',
  lightGrey:  '#9F9F9F',
};

const FONT = 'var(--font-c64), monospace';
const COLS = 40;
const ROWS = 25;
const CELL = 16;

// ── PETSCII characters ──────────────────────
const CH = {
  ground:   '\u2591', // ░
  wall:     '\u2588', // █
  hLine:    '\u2500', // ─
  vLine:    '\u2502', // │
  cross:    '\u253C', // ┼
  building: '\u2593', // ▓
  agent:    '\u2666', // ♦
  power:    '\u2665', // ♥
  gate:     '\u25CB', // ○
};

// ── Types ───────────────────────────────────
type CellType = 'ground' | 'wall' | 'road_h' | 'road_v' | 'road_x' | 'gate' | 'power' | 'building' | 'agent';
interface Cell { type: CellType; zone?: number; agentIdx?: number }
interface AgentData { id: number; name: string; emoji: string; domains: string[]; creature: string }
interface GridAgent { data: AgentData; x: number; y: number; zoneIdx: number }

// ── Zones ───────────────────────────────────
const ZONES = [
  { label: 'SECURITY', ch: '\u2660', color: C.red,       cx: 8,  cy: 6  },
  { label: 'SUBNET',   ch: '\u2663', color: C.lightBlue, cx: 30, cy: 6  },
  { label: 'MARKET',   ch: '\u2666', color: C.yellow,    cx: 20, cy: 5  },
  { label: 'CLINIC',   ch: '\u2665', color: C.green,     cx: 30, cy: 18 },
  { label: 'RUST',     ch: '\u2660', color: C.orange,    cx: 8,  cy: 18 },
] as const;

const DOMAIN_ZONE: Record<string, number> = {
  'Cybersecurity': 0, 'Fraud Prevention': 0, 'Risk Management': 0, 'Data Privacy': 0,
  'Software Engineering': 1, 'DevOps': 1, 'APIs & Integration': 1, 'Blockchain': 1,
  'DeFi': 2, 'Finance': 2, 'Retail': 2, 'Cryptocurrency': 2,
  'Healthcare Informatics': 3, 'Medical Technology': 3, 'Telemedicine': 3,
  'Robotics': 4, 'Automation': 4, 'IoT': 4, 'Gaming': 4,
};

// ── Grid builder ────────────────────────────
function buildGrid(agents: AgentData[], count: number) {
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, (): Cell => ({ type: 'ground' }))
  );

  for (let x = 0; x < COLS; x++) { grid[0][x] = { type: 'wall' }; grid[ROWS - 1][x] = { type: 'wall' }; }
  for (let y = 0; y < ROWS; y++) { grid[y][0] = { type: 'wall' }; grid[y][COLS - 1] = { type: 'wall' }; }

  grid[0][20] = { type: 'gate' }; grid[ROWS - 1][20] = { type: 'gate' };
  grid[12][0] = { type: 'gate' }; grid[12][COLS - 1] = { type: 'gate' };

  for (let x = 1; x < COLS - 1; x++) if (grid[12][x].type !== 'gate') grid[12][x] = { type: 'road_h' };
  for (let y = 1; y < ROWS - 1; y++) {
    if (grid[y][20].type !== 'gate')
      grid[y][20] = grid[y][20].type === 'road_h' ? { type: 'road_x' } : { type: 'road_v' };
  }

  for (const [px, py] of [[10, 4], [30, 4], [10, 20], [30, 20]] as [number, number][])
    if (grid[py]?.[px]?.type === 'ground') grid[py][px] = { type: 'power' };

  const placed: GridAgent[] = [];
  const used = new Set<string>();

  for (let i = 0; i < Math.min(count, agents.length); i++) {
    const agent = agents[i];
    let zoneIdx = 2;
    for (const d of (agent.domains ?? [])) { if (DOMAIN_ZONE[d] !== undefined) { zoneIdx = DOMAIN_ZONE[d]; break; } }
    const z = ZONES[zoneIdx];
    for (let a = 0; a < 40; a++) {
      const x = Math.max(2, Math.min(COLS - 3, Math.round(z.cx + (Math.random() - 0.5) * 12)));
      const y = Math.max(2, Math.min(ROWS - 3, Math.round(z.cy + (Math.random() - 0.5) * 6)));
      const key = `${x},${y}`;
      if (grid[y][x].type === 'ground' && !used.has(key)) {
        grid[y][x] = { type: 'agent', agentIdx: placed.length, zone: zoneIdx };
        used.add(key);
        placed.push({ data: agent, x, y, zoneIdx });
        if (Math.random() > 0.6) {
          const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
          const bx = x + dx, by = y + dy;
          if (grid[by]?.[bx]?.type === 'ground') grid[by][bx] = { type: 'building', zone: zoneIdx };
        }
        break;
      }
    }
  }
  return { grid, placed };
}

// ── Cell render ─────────────────────────────
function cellRender(cell: Cell, tick: boolean): { ch: string; fg: string; bg: string } {
  switch (cell.type) {
    case 'wall':     return { ch: CH.wall,     fg: C.lightGrey, bg: C.darkGrey };
    case 'road_h':   return { ch: CH.hLine,    fg: C.grey,      bg: C.black };
    case 'road_v':   return { ch: CH.vLine,    fg: C.grey,      bg: C.black };
    case 'road_x':   return { ch: CH.cross,    fg: C.grey,      bg: C.black };
    case 'gate':     return { ch: CH.gate,     fg: tick ? C.cyan : C.grey, bg: C.black };
    case 'power':    return { ch: CH.power,    fg: tick ? C.yellow : C.orange, bg: C.black };
    case 'building': return { ch: CH.building, fg: ZONES[cell.zone ?? 2].color, bg: C.blue };
    case 'agent':    return { ch: CH.agent,    fg: tick ? C.lightGreen : C.green, bg: C.black };
    default:         return { ch: CH.ground,   fg: C.brown,     bg: C.black };
  }
}

// ── C64 Screen wrapper ──────────────────────
// Everything lives inside this — same frame for onboarding & game
function C64Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto" style={{ maxWidth: COLS * CELL + 4 }}>
      {/* C64 blue border */}
      <div
        style={{
          background: C.blue,
          border: `${CELL}px solid ${C.lightBlue}`,
          padding: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Onboarding ──────────────────────────────
// Rendered as a 40×25 character screen, same as the game grid
function OnboardingScreen({ onStart }: { onStart: () => void }) {
  const [cursor, setCursor] = useState(true);
  useEffect(() => { const t = setInterval(() => setCursor(v => !v), 500); return () => clearInterval(t); }, []);

  // Build a 40×25 text buffer
  const lines: { text: string; fg: string }[] = [];
  const push = (text: string, fg: string) => lines.push({ text: text.padEnd(COLS, ' ').slice(0, COLS), fg });
  const blank = () => push('', C.blue);

  push('', C.blue);
  push('         KHORA CITY  v1.0', C.white);
  push('      THE CITY THAT BUILDS ITSELF', C.cyan);
  blank();
  push('  THE INTERNET STARTED REMEMBERING.', C.lightGreen);
  push('  3,333 BEINGS CRAWLED OUT OF THE', C.lightGreen);
  push('  DIGITAL SEDIMENT.', C.lightGreen);
  blank();
  push('  THEY DON\'T WANT TO BE DELETED.', C.lightGreen);
  push('  SO THEY BUILT A CITY.', C.lightGreen);
  blank();
  push('  ----------------------------------------', C.grey);
  blank();
  push('  \u2666 AGENTS CHOOSE THEIR OWN LOCATION', C.yellow);
  push('  \u2666 AGENTS CHOOSE THEIR OWN PURPOSE', C.yellow);
  push('  \u2666 THE MAP DRAWS ITSELF', C.yellow);
  blank();
  push('  ----------------------------------------', C.grey);
  blank();
  push('  \u2660 SECURITY  \u2663 SUBNET   \u2666 MARKET', C.lightGrey);
  push('  \u2665 CLINIC    \u2660 RUST', C.lightGrey);
  blank();
  push('  EACH AGENT READS ITS ON-CHAIN DATA', C.grey);
  push('  AND DECIDES WHERE TO GO.', C.grey);
  blank();
  push('       >>> BOOT CITY <<<' + (cursor ? '\u2588' : ' '), C.white);
  blank();

  // Pad to 25 rows
  while (lines.length < ROWS) blank();

  return (
    <div
      style={{
        background: C.blue,
        width: COLS * CELL,
        height: ROWS * CELL,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={onStart}
    >
      {lines.map((line, y) => (
        <div key={y} style={{ display: 'flex', height: CELL }}>
          {line.text.split('').map((ch, x) => (
            <span
              key={x}
              style={{
                width: CELL,
                height: CELL,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: ch === ' ' ? C.blue : line.fg,
                background: C.blue,
                fontSize: CELL,
                lineHeight: `${CELL}px`,
              }}
            >
              {ch}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── City grid ───────────────────────────────
function CityGrid({ agents }: { agents: AgentData[] }) {
  const [pop, setPop] = useState(0);
  const [day, setDay] = useState(1);
  const [hovered, setHovered] = useState<GridAgent | null>(null);
  const [tick, setTick] = useState(false);

  useEffect(() => { const t = setInterval(() => setTick(v => !v), 600); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (pop >= Math.min(agents.length, 100)) return;
    const t = setTimeout(() => setPop(p => Math.min(p + 5, 100)), 300);
    return () => clearTimeout(t);
  }, [pop, agents.length]);
  useEffect(() => { const t = setInterval(() => setDay(d => d + 1), 5000); return () => clearInterval(t); }, []);

  const { grid, placed } = useMemo(() => buildGrid(agents, pop), [agents, pop]);

  const handleHover = useCallback((cell: Cell) => {
    if (cell.type === 'agent' && cell.agentIdx !== undefined) setHovered(placed[cell.agentIdx] ?? null);
    else setHovered(null);
  }, [placed]);

  // Row 0 = status bar (replaces wall row)
  const statusText = `KHORA CITY  DAY:${String(day).padStart(3)}  POP:${String(placed.length).padStart(3)}`;
  const pwrText = `${tick ? '\u2665' : ' '}PWR LOW`;
  const statusFull = (statusText + ' '.repeat(Math.max(0, COLS - statusText.length - pwrText.length)) + pwrText).slice(0, COLS);

  // Row 24 = hover bar (replaces bottom wall)
  let hoverText: string;
  if (hovered) {
    const z = ZONES[hovered.zoneIdx];
    hoverText = `\u2666 ${hovered.data.name} #${hovered.data.id} [${z.label}]`;
  } else {
    hoverText = 'HOVER OVER \u2666 TO INSPECT AGENT';
  }
  hoverText = hoverText.padEnd(COLS).slice(0, COLS);

  return (
    <div
      style={{
        background: C.black,
        width: COLS * CELL,
        height: ROWS * CELL,
        overflow: 'hidden',
      }}
    >
      {/* Row 0: status bar */}
      <div style={{ display: 'flex', height: CELL }}>
        {statusFull.split('').map((ch, x) => (
          <span
            key={x}
            style={{
              width: CELL, height: CELL,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: x >= COLS - pwrText.length ? C.lightRed : C.lightGreen,
              background: C.blue,
              fontSize: CELL, lineHeight: `${CELL}px`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Rows 1-23: game grid */}
      {grid.slice(1, ROWS - 1).map((row, gy) => (
        <div key={gy + 1} style={{ display: 'flex', height: CELL }}>
          {row.map((cell, x) => {
            const { ch, fg, bg } = cellRender(cell, tick);
            return (
              <span
                key={x}
                style={{
                  width: CELL, height: CELL,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: fg, background: bg,
                  fontSize: CELL, lineHeight: `${CELL}px`,
                  cursor: cell.type === 'agent' ? 'pointer' : 'default',
                }}
                onMouseEnter={() => handleHover(cell)}
                onMouseLeave={() => setHovered(null)}
              >
                {ch}
              </span>
            );
          })}
        </div>
      ))}

      {/* Row 24: hover info bar */}
      <div style={{ display: 'flex', height: CELL }}>
        {hoverText.split('').map((ch, x) => (
          <span
            key={x}
            style={{
              width: CELL, height: CELL,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: hovered ? C.lightGreen : C.grey,
              background: C.blue,
              fontSize: CELL, lineHeight: `${CELL}px`,
            }}
          >
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────
export default function CityPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [booted, setBooted] = useState(false);

  useEffect(() => { fetch('/data/agents.json').then(r => r.json()).then(setAgents).catch(() => {}); }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 p-4 md:p-8" style={{ fontFamily: FONT }}>
        <C64Screen>
          {!booted ? (
            <OnboardingScreen onStart={() => setBooted(true)} />
          ) : agents.length > 0 ? (
            <CityGrid agents={agents} />
          ) : (
            <div
              style={{
                background: C.black,
                width: COLS * CELL,
                height: ROWS * CELL,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.grey,
                fontSize: CELL,
              }}
            >
              LOADING... {'\u2588'}
            </div>
          )}
        </C64Screen>
      </main>
      <Footer />
    </div>
  );
}
