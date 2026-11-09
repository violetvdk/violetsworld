// Computer-tegenstander: negamax met alpha-beta over "acties"
// (zet, muur plaatsen of muur overslaan), met slagzetten-uitbreiding aan de zoekgrens.
import {
  allLegalMoves,
  applyAction,
  makeMove,
  placeWall,
  skipWall,
  inCheck,
  isAttacked,
  mobility,
  isFreeSquare,
} from './chess.js'

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const other = (c) => (c === 'w' ? 'b' : 'w')

export const LEVELS = {
  easy: { label: 'Makkelijk', depth: 1, noise: 40, rootWalls: 5, innerWalls: 2, quiesce: 0 },
  normal: { label: 'Normaal', depth: 2, noise: 8, rootWalls: 10, innerWalls: 3, quiesce: 2 },
  hard: { label: 'Moeilijk', depth: 3, noise: 3, rootWalls: 12, innerWalls: 3, quiesce: 3 },
}

// Score vanuit het oogpunt van `color` (hoger = beter).
function evaluate(state, color) {
  let score = 0
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (!p) continue
    const r = i >> 3
    const c = i & 7
    let v = VALUE[p.t]
    const centre = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5))
    if (p.t === 'p') {
      const advance = p.c === 'w' ? 6 - r : r - 1
      v += advance * 6 + centre * 2
    } else if (p.t !== 'k' && p.t !== 'r') {
      v += centre * 6
    }
    score += p.c === color ? v : -v
  }
  return score
}

/* ------------------------------------------------------------ muren kiezen */

// Hoe goed is een muur op `sq` voor de speler die hem mag plaatsen?
// - een muur die het schaak blokkeert is goud waard
// - houd eigen stukken beweeglijk, beperk de tegenstander
// - (alleen `full`) bescherm eigen stukken die worden aangevallen, laat aanvallen op de tegenstander intact
function wallScore(state, sq, ctx, full) {
  const { me, opp, wasChecked } = ctx
  const walls = state.walls.slice()
  walls[sq] = true
  const s = { ...state, walls }

  let score = mobility(s, me) - mobility(s, opp)
  if (wasChecked && !inCheck(s, me)) score += 2000

  if (full) {
    for (let i = 0; i < 64; i++) {
      const p = s.board[i]
      if (!p || p.t === 'k') continue
      if (p.c === me) {
        if (isAttacked(s, i, opp)) {
          const defended = isAttacked(s, i, me)
          score -= defended ? VALUE[p.t] * 0.1 : VALUE[p.t] * 0.8
        }
      } else if (isAttacked(s, i, me)) {
        const defended = isAttacked(s, i, opp)
        score += defended ? VALUE[p.t] * 0.05 : VALUE[p.t] * 0.5
      }
    }
  }
  return score
}

// Geeft [{ sq, score }] gesorteerd van best naar slechtst.
function rankedWalls(state, limit, full) {
  const me = state.pendingWall
  const ctx = { me, opp: other(me), wasChecked: inCheck(state, me) }
  const out = []
  for (let sq = 0; sq < 64; sq++) {
    if (!isFreeSquare(state, sq)) continue
    out.push({ sq, score: wallScore(state, sq, ctx, full) })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

function actionsFor(state, wallLimit, full = false) {
  if (state.pendingWall) {
    return [
      { type: 'skip' },
      ...rankedWalls(state, wallLimit, full).map((w) => ({ type: 'wall', sq: w.sq, pre: w.score })),
    ]
  }
  const moves = allLegalMoves(state)
  // slagzetten (met de duurste prooi) eerst voor snellere alpha-beta
  moves.sort((a, b) => scoreMove(state, b) - scoreMove(state, a))
  return moves.map((move) => ({ type: 'move', move }))
}

function scoreMove(state, m) {
  if (!m.capture) return m.promotion ? 800 : 0
  const victim = m.enPassant ? VALUE.p : VALUE[state.board[m.to]?.t] || 0
  return 10 * victim - VALUE[state.board[m.from].t] + 1000
}

function apply(state, a) {
  if (a.type === 'move') return makeMove(state, a.move, true)
  if (a.type === 'wall') return placeWall(state, a.sq, true)
  return skipWall(state, true)
}

/* ------------------------------------------------------------------ zoeken */

// Alleen slagzetten uitrekenen tot de stelling rustig is (voorkomt dat je een verdedigd stuk "gratis" slaat).
function quiesce(state, alpha, beta, qd) {
  const stand = evaluate(state, state.turn)
  if (qd <= 0) return stand
  if (stand >= beta) return stand
  if (stand > alpha) alpha = stand
  const caps = allLegalMoves(state)
    .filter((m) => m.capture)
    .sort((a, b) => scoreMove(state, b) - scoreMove(state, a))
  for (const m of caps) {
    // hier negeren we de muur die de tegenstander na de slag mag zetten
    const next = skipWall(makeMove(state, m, true), true)
    const score = -quiesce(next, -beta, -alpha, qd - 1)
    if (score >= beta) return score
    if (score > alpha) alpha = score
  }
  return alpha
}

function search(state, depth, alpha, beta, level) {
  if (depth <= 0 && !state.pendingWall) return quiesce(state, alpha, beta, level.quiesce)
  const acts = actionsFor(state, level.innerWalls)
  if (acts.length === 0) {
    return inCheck(state, state.turn) ? -100000 - depth : 0
  }
  let best = -Infinity
  for (const a of acts) {
    const next = apply(state, a)
    let score
    if (next.turn === state.turn) {
      // na het plaatsen van een muur is dezelfde speler nog aan zet
      score = search(next, depth, alpha, beta, level)
    } else {
      score = -search(next, depth - 1, -beta, -alpha, level)
    }
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return best
}

export function chooseAction(state, levelKey = 'normal') {
  const level = LEVELS[levelKey] || LEVELS.normal
  const acts = actionsFor(state, level.rootWalls, true)
  if (acts.length === 0) return null
  const me = state.turn
  const standing = evaluate(state, me)

  let bestAct = null
  let bestScore = -Infinity
  for (const a of acts) {
    const next = apply(state, a)
    let score
    if (next.turn === state.turn) {
      score = search(next, level.depth, -Infinity, Infinity, level)
    } else {
      score = -search(next, level.depth - 1, -Infinity, Infinity, level)
    }

    // Muren: kleine voorkeur voor de muur die het beste uitkomt; overslaan is net iets minder aantrekkelijk
    if (a.type === 'wall') score += Math.max(-20, Math.min(40, a.pre / 8))
    if (a.type === 'skip') score -= 1

    // Remise (herhaling, 50 zetten, dode stelling): vermijden als je wint, zoeken als je verliest
    const real = applyAction(state, a)
    if (real && real.status === 'draw') {
      if (standing > 150) score -= 600
      else if (standing < -150) score += 300
    }

    score += (Math.random() - 0.5) * 2 * level.noise
    if (score > bestScore) {
      bestScore = score
      bestAct = a
    }
  }
  return bestAct
}
