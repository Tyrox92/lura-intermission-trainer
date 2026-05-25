import React, { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'lura-crystal-trainer-settings-v3';

const ARENA = 720;
const CENTER = ARENA / 2;
const RADIUS = 350;
const PLAYER_R = 10;
const CRYSTAL_R = 13;
const PLAYER_SPEED = 210;
const SIM_SECONDS = 30;

const BEAM_INTERVAL = 5;
const BEAM_WARNING = 3;
const BEAM_ACTIVE = 2;
const BEAM_WIDTH = 48;

const STAR_WARNING = 3;
const STAR_ACTIVE = 0.85;
const STAR_TOTAL = STAR_WARNING + STAR_ACTIVE;
const STAR_INTERVAL_MIN = 3.2;
const STAR_INTERVAL_MAX = 5.0;
const STAR_COUNT_MIN = 5;
const STAR_COUNT_MAX = 6;

const PICKUP_DISTANCE = PLAYER_R + CRYSTAL_R + 5;
const REARM_PICKUP_DISTANCE = PLAYER_R + CRYSTAL_R + 18;

const DEFAULT_ACTION_COMBO = {
  code: 'KeyQ',
  key: 'Q',
  ctrl: false,
  shift: true,
  alt: false,
  meta: false,
};

const raid = [
  ['Pains', 250, 95],
  ['Insa', 380, 95],
  ['Melascula', 560, 150],
  ['Cimera', 225, 170],
  ['Nihilara', 90, 160],
  ['Shikaya', 155, 245],
  ['Gromun', 140, 340],
  ['Lbo', 35, 320],
  ['Doom', 85, 470],
  ['Para', 205, 500],
  ['Dapl', 195, 590],
  ['Kreb', 280, 535],
  ['Wahana', 360, 535],
  ['Shaamy', 390, 625],
  ['Frost', 510, 570],
  ['Arkade', 465, 480],
  ['Zoukie', 500, 355],
  ['Meme', 600, 465],
  ['Carlinn', 640, 290],
  ['Sy bien', 475, 220],
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function inArena(p, pad = 0) {
  return Math.hypot(p.x - CENTER, p.y - CENTER) <= RADIUS - pad;
}

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function randomInt(a, b) {
  return Math.floor(randomBetween(a, b + 1));
}

function pickMany(arr, count) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < count) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function makeBeam(now, id) {
  return {
    id,
    angle: Math.random() * Math.PI * 2,
    warnUntil: now + BEAM_WARNING,
    activeUntil: now + BEAM_WARNING + BEAM_ACTIVE,
  };
}

function makeStar(target, now, id, final = false) {
  const rays = final ? 8 : randomInt(5, 6);
  return {
    id,
    target,
    start: now,
    activeAt: now + STAR_WARNING,
    end: now + STAR_TOTAL,
    rays,
    rotation: Math.random() * Math.PI * 2,
    final,
  };
}

function pointLineDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function beamHitsCircle(beam, p, radius) {
  const len = RADIUS + 20;
  const ax = CENTER;
  const ay = CENTER;
  const bx = CENTER + Math.cos(beam.angle) * len;
  const by = CENTER + Math.sin(beam.angle) * len;
  return pointLineDistance(p.x, p.y, ax, ay, bx, by) <= BEAM_WIDTH / 2 + radius;
}

function starSegments(pos, star) {
  const segments = [];
  const inner = 18;
  const outer = 145;
  for (let i = 0; i < star.rays; i++) {
    const a = star.rotation + (i / star.rays) * Math.PI * 2;
    segments.push({
      ax: pos.x + Math.cos(a) * inner,
      ay: pos.y + Math.sin(a) * inner,
      bx: pos.x + Math.cos(a) * outer,
      by: pos.y + Math.sin(a) * outer,
    });
  }
  return segments;
}

function starHitsCircle(pos, star, circle, radius) {
  for (const s of starSegments(pos, star)) {
    if (pointLineDistance(circle.x, circle.y, s.ax, s.ay, s.bx, s.by) <= 6 + radius) {
      return true;
    }
  }
  return false;
}

function getRaidMember(name) {
  return raid.find(([n]) => n === name) || raid.find(([n]) => n === 'Frost');
}

function initialGame(playerName = 'Frost') {
  const player = getRaidMember(playerName);
  return {
    running: true,
    failed: null,
    time: 0,
    player: { x: player[1], y: player[2] },
    hasCrystal: true,
    crystal: null,
    beams: [],
    stars: [],
    nextBeam: BEAM_INTERVAL,
    nextStars: 2.4,
    finalStarsDone: false,
    beamId: 1,
    starId: 1,
    drops: 0,
  };
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.playerName && saved?.actionCombo?.code) return saved;
  } catch {
    return null;
  }
  return null;
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function eventToCombo(e) {
  const isOnlyModifier = ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code);
  if (isOnlyModifier) return null;

  return {
    code: e.code,
    key: prettyKey(e),
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

function prettyKey(e) {
  if (e.code.startsWith('Key')) return e.code.replace('Key', '').toUpperCase();
  if (e.code.startsWith('Digit')) return e.code.replace('Digit', '');
  if (e.code.startsWith('Numpad')) return e.code.replace('Numpad', 'Num ');
  if (e.code === 'Space') return 'Space';
  if (e.code === 'Escape') return 'Esc';
  return e.code.replace('Arrow', '').replace('Control', 'Ctrl');
}

function comboLabel(combo) {
  if (!combo?.code) return 'nicht gesetzt';
  const parts = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.shift) parts.push('Shift');
  if (combo.alt) parts.push('Alt');
  if (combo.meta) parts.push('Meta');
  parts.push(combo.key || combo.code);
  return parts.join(' + ');
}

function comboMatchesEvent(combo, e) {
  if (!combo) return false;
  return (
    combo.code === e.code &&
    Boolean(combo.ctrl) === e.ctrlKey &&
    Boolean(combo.shift) === e.shiftKey &&
    Boolean(combo.alt) === e.altKey &&
    Boolean(combo.meta) === e.metaKey
  );
}

export default function App() {
  const initialSettings = loadSettings();
  const [playerName, setPlayerName] = useState(initialSettings?.playerName || 'Frost');
  const [actionCombo, setActionCombo] = useState(initialSettings?.actionCombo || DEFAULT_ACTION_COMBO);
  const [setupOpen, setSetupOpen] = useState(!initialSettings);
  const [recording, setRecording] = useState(false);

  const [game, setGame] = useState(() => initialGame(initialSettings?.playerName || 'Frost'));
  const keys = useRef({});
  const actionPressed = useRef(false);
  const last = useRef(performance.now());
  const actionComboRef = useRef(actionCombo);
  const playerNameRef = useRef(playerName);

  const teammates = useMemo(
    () => raid.map(([name, x, y]) => ({ name, x, y })).filter((t) => t.name !== playerName),
    [playerName]
  );

  useEffect(() => {
    actionComboRef.current = actionCombo;
  }, [actionCombo]);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  function restart(nextPlayerName = playerNameRef.current) {
    actionPressed.current = false;
    last.current = performance.now();
    setGame(initialGame(nextPlayerName));
  }

  function applySettings(nextPlayerName = playerName, nextCombo = actionCombo) {
    saveSettings({ playerName: nextPlayerName, actionCombo: nextCombo });
    setSetupOpen(false);
    restart(nextPlayerName);
  }

  function handlePlayerChange(name) {
    setPlayerName(name);
    saveSettings({ playerName: name, actionCombo });
    restart(name);
  }

  function handleRecordKey(e) {
    e.preventDefault();
    e.stopPropagation();

    const combo = eventToCombo(e);
    if (!combo) return;

    setActionCombo(combo);
    saveSettings({ playerName, actionCombo: combo });
    setRecording(false);
  }

  useEffect(() => {
    if (!recording) return;

    window.addEventListener('keydown', handleRecordKey, { passive: false });
    return () => window.removeEventListener('keydown', handleRecordKey);
  }, [recording, playerName, actionCombo]);

  useEffect(() => {
    const down = (e) => {
      const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
      const actionHit = comboMatchesEvent(actionComboRef.current, e);

      if (movementKeys.includes(e.code) || actionHit) {
        e.preventDefault();
      }

      keys.current[e.code] = true;

      if (actionHit && !e.repeat) {
        actionPressed.current = true;
      }
    };

    const up = (e) => {
      const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
      const actionHit = comboMatchesEvent(actionComboRef.current, e);

      if (movementKeys.includes(e.code) || actionHit) {
        e.preventDefault();
      }

      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up, { passive: false });

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    let raf;
    const tick = (nowMs) => {
      const dt = Math.min(0.033, (nowMs - last.current) / 1000);
      last.current = nowMs;

      setGame((g) => {
        if (!g.running || setupOpen || recording) return g;

        let ng = { ...g, time: g.time + dt };
        const now = ng.time;

        let vx = 0;
        let vy = 0;
        if (keys.current.KeyW) vy -= 1;
        if (keys.current.KeyS) vy += 1;
        if (keys.current.KeyA) vx -= 1;
        if (keys.current.KeyD) vx += 1;

        if (vx || vy) {
          const l = Math.hypot(vx, vy);
          vx /= l;
          vy /= l;
          const candidate = {
            x: ng.player.x + vx * PLAYER_SPEED * dt,
            y: ng.player.y + vy * PLAYER_SPEED * dt,
          };
          if (inArena(candidate, PLAYER_R)) ng.player = candidate;
        }

        if (actionPressed.current) {
          actionPressed.current = false;
          if (ng.hasCrystal) {
            ng.hasCrystal = false;
            ng.crystal = {
              x: ng.player.x,
              y: ng.player.y,
              droppedAt: now,
              pickupArmed: false,
            };
            ng.drops += 1;
          }
        }

        if (!ng.hasCrystal && ng.crystal) {
          const distanceToCrystal = dist(ng.player, ng.crystal);

          if (!ng.crystal.pickupArmed && distanceToCrystal >= REARM_PICKUP_DISTANCE) {
            ng.crystal = { ...ng.crystal, pickupArmed: true };
          }

          if (ng.crystal.pickupArmed && distanceToCrystal <= PICKUP_DISTANCE) {
            ng.hasCrystal = true;
            ng.crystal = null;
          }
        }

        if (!ng.hasCrystal && ng.crystal && now - ng.crystal.droppedAt > 5) {
          return { ...ng, running: false, failed: 'Crystal lag länger als 5 Sekunden auf dem Boden.' };
        }

        if (now >= ng.nextBeam) {
          const newBeams = Array.from({ length: 4 }, (_, i) => makeBeam(now, ng.beamId + i));
          ng.beams = [...ng.beams, ...newBeams];
          ng.beamId += 4;
          ng.nextBeam += BEAM_INTERVAL;
        }
        ng.beams = ng.beams.filter((b) => now <= b.activeUntil);

        if (now >= ng.nextStars && now < SIM_SECONDS - 3) {
          const count = randomInt(STAR_COUNT_MIN, STAR_COUNT_MAX);
          const possibleTargets = [
            ...teammates,
            { name: playerNameRef.current, x: ng.player.x, y: ng.player.y },
          ];
          const chosen = pickMany(possibleTargets, count);
          const newStars = chosen.map((t, i) => makeStar(t.name, now, ng.starId + i));
          ng.stars = [...ng.stars, ...newStars];
          ng.starId += newStars.length;
          ng.nextStars = now + randomBetween(STAR_INTERVAL_MIN, STAR_INTERVAL_MAX);
        }

        if (!ng.finalStarsDone && now >= SIM_SECONDS) {
          const allTargets = [
            ...teammates,
            { name: playerNameRef.current, x: ng.player.x, y: ng.player.y },
          ];
          const newStars = allTargets.map((t, i) => makeStar(t.name, now, ng.starId + i, true));
          ng.stars = [...ng.stars, ...newStars];
          ng.starId += newStars.length;
          ng.finalStarsDone = true;
        }
        ng.stars = ng.stars.filter((s) => now <= s.end);

        const crystalPos = ng.hasCrystal ? ng.player : ng.crystal;
        if (crystalPos) {
          for (const b of ng.beams) {
            if (now > b.warnUntil && beamHitsCircle(b, crystalPos, CRYSTAL_R)) {
              return { ...ng, running: false, failed: 'Crystal wurde von einem Beam getroffen.' };
            }
          }

          for (const s of ng.stars) {
            if (now < s.activeAt) continue;

            const holder =
              s.target === playerNameRef.current
                ? ng.player
                : teammates.find((t) => t.name === s.target);

            if (holder && starHitsCircle(holder, s, crystalPos, CRYSTAL_R)) {
              return {
                ...ng,
                running: false,
                failed: `Crystal wurde von der Starsplinter-Explosion von ${s.target} getroffen.`,
              };
            }
          }
        }

        if (ng.finalStarsDone && ng.stars.length === 0 && now > SIM_SECONDS + STAR_TOTAL) {
          return { ...ng, running: false, failed: 'Clear. Intermission sauber überlebt.' };
        }

        return ng;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [teammates, setupOpen, recording]);

  const nextBeamCountdown = Math.max(0, game.nextBeam - game.time);
  const beamAnnouncement = nextBeamCountdown <= BEAM_WARNING && game.time < SIM_SECONDS + 1;
  const crystalAge = game.crystal ? game.time - game.crystal.droppedAt : 0;
  const success = game.failed && game.failed.startsWith('Clear');
  const playerStar = game.stars.find((s) => s.target === playerName);

  return (
    <main className="app">
      <section className="layout">
        <div className="panel arenaPanel">
          <div className="arena" style={{ width: ARENA, height: ARENA }}>
            <div className="arenaBg">
              <div className="ringOuter" />
              <div className="ringInner" />
            </div>

            <div className="boss">☠</div>

            {game.beams.map((b) => {
              const active = game.time > b.warnUntil;
              return (
                <div
                  key={b.id}
                  className={active ? 'beam active' : 'beam warning'}
                  style={{
                    width: RADIUS + 20,
                    height: BEAM_WIDTH,
                    marginTop: -BEAM_WIDTH / 2,
                    transform: `rotate(${b.angle}rad)`,
                  }}
                />
              );
            })}

            {teammates.map((t) => {
              const activeStar = game.stars.find((s) => s.target === t.name);
              return (
                <React.Fragment key={t.name}>
                  {activeStar && <Star x={t.x} y={t.y} star={activeStar} now={game.time} />}
                  <div className="teammate" style={{ left: t.x, top: t.y }}>
                    <div className="teammateIcon" />
                    <div className="name">{t.name}</div>
                  </div>
                </React.Fragment>
              );
            })}

            {playerStar && <Star x={game.player.x} y={game.player.y} star={playerStar} now={game.time} player />}

            {game.crystal && (
              <div
                className={game.crystal.pickupArmed ? 'crystal pickupReady' : 'crystal'}
                style={{
                  left: game.crystal.x,
                  top: game.crystal.y,
                  width: CRYSTAL_R * 2,
                  height: CRYSTAL_R * 2,
                }}
              />
            )}

            <div className="player" style={{ left: game.player.x, top: game.player.y }}>
              <div className={game.hasCrystal ? 'playerIcon hasCrystal' : 'playerIcon'}>
                {game.hasCrystal && <div className="innerCrystal" />}
              </div>
              <div className="playerName">{playerName}</div>
            </div>

            {beamAnnouncement && game.running && (
              <div className="raidWarning">
                Beams ({nextBeamCountdown.toFixed(1)})
              </div>
            )}

            {!game.running && game.failed && (
              <div className="wipeOverlay">
                <div className={success ? 'resultBox success' : 'resultBox fail'}>
                  <h2>{success ? 'Clear' : 'Wipe'}</h2>
                  <p>{game.failed}</p>
                  <button onClick={() => restart()}>Retry</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="panel sidebar">
          <h1>L'ura Crystal Trainer</h1>
          <p>WASD bewegen. Dein Action-Button legt den Crystal ab. Danach kurz rauslaufen und wieder drüberlaufen zum Aufheben.</p>

          <div className="settingsBox">
            <label>
              Player
              <select value={playerName} onChange={(e) => handlePlayerChange(e.target.value)}>
                {raid.map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <div className="keybindRow">
              <div>
                <span>Action-Button</span>
                <b>{comboLabel(actionCombo)}</b>
              </div>
              <button className="smallButton" onClick={() => setRecording(true)}>
                Ändern
              </button>
            </div>
          </div>

          <div className="stats">
            <Stat label="Timer" value={`${game.time.toFixed(1)}s / ${SIM_SECONDS}s`} />
            <Stat
              label="Crystal"
              value={game.hasCrystal ? 'getragen' : `boden ${Math.max(0, 5 - crystalAge).toFixed(1)}s`}
              danger={!game.hasCrystal && 5 - crystalAge < 1.5}
            />
            <Stat label="Nächste Beams" value={`${nextBeamCountdown.toFixed(1)}s`} danger={nextBeamCountdown <= 3} />
            <Stat label="Drops" value={game.drops} />
          </div>

          <div className="infoBox">
            <strong>Fail Conditions</strong>
            <p>Crystal liegt länger als 5 Sekunden.</p>
            <p>Crystal wird vom aktiven Beam getroffen.</p>
            <p>Starsplinter darf den Crystal während der 3 Sekunden Warnzeit berühren. Erst die Explosion danach zählt als Hit.</p>
          </div>

          <div className="infoBox">
            <strong>Hinweis</strong>
            <p>Manche System-Shortcuts wie Alt + F4 können Browser oder Betriebssystem blocken. Normale Tasten, F-Tasten und Kombis mit Ctrl, Shift oder Alt funktionieren in der Regel.</p>
          </div>

          <button className="restart" onClick={() => restart()}>Restart Run</button>
        </aside>
      </section>

      {setupOpen && (
        <div className="modalOverlay">
          <div className="modal">
            <h2>Setup</h2>
            <p>Wähle deinen Player und lege deinen Crystal-Drop-Button fest.</p>

            <label>
              Player
              <select value={playerName} onChange={(e) => setPlayerName(e.target.value)}>
                {raid.map(([name]) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <div className="recordBox">
              <span>Action-Button</span>
              <b>{comboLabel(actionCombo)}</b>
              <button onClick={() => setRecording(true)}>
                Taste aufnehmen
              </button>
            </div>

            <button className="restart" onClick={() => applySettings(playerName, actionCombo)}>
              Start
            </button>
          </div>
        </div>
      )}

      {recording && (
        <div className="modalOverlay topLayer">
          <div className="modal keyModal">
            <h2>Taste drücken</h2>
            <p>Drücke jetzt deine gewünschte Taste oder Kombination, zum Beispiel B, F4, Ctrl + X oder Shift + Q.</p>
            <button onClick={() => setRecording(false)}>Abbrechen</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value, danger }) {
  return (
    <div className={danger ? 'stat danger' : 'stat'}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Star({ x, y, star, now, player }) {
  const size = 320;
  const center = size / 2;
  const inner = 18;
  const outer = 145;
  const segments = [];
  const active = now >= star.activeAt;

  for (let i = 0; i < star.rays; i++) {
    const a = star.rotation + (i / star.rays) * Math.PI * 2;
    segments.push({
      x1: center + Math.cos(a) * inner,
      y1: center + Math.sin(a) * inner,
      x2: center + Math.cos(a) * outer,
      y2: center + Math.sin(a) * outer,
    });
  }

  return (
    <svg
      className={[
        'star',
        player ? 'playerStar' : '',
        active ? 'starActive' : 'starWarning',
      ].join(' ')}
      width={size}
      height={size}
      style={{ left: x - center, top: y - center }}
    >
      {segments.map((s, i) => (
        <line
          key={i}
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={active ? 'rgb(248 113 113)' : 'rgb(56 189 248)'}
          strokeWidth={active ? '14' : '8'}
          strokeLinecap="round"
          opacity={active ? '0.98' : '0.55'}
        />
      ))}
      <circle cx={center} cy={center} r="8" fill="rgb(15 23 42)" stroke="white" strokeWidth="2" />
    </svg>
  );
}
