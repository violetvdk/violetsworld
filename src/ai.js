// Computer-tegenstander: negamax met alpha-beta over "acties" (zet, muur plaatsen of overslaan).
import {
  allLegalMoves,
  makeMove,
  placeWall,
  skipWall,
  inCheck,
  mobility,
  isFreeSquare,
} from './chess.js'

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

export const LEVELS = {
  easy: { label: 'Makkelijk', depth: 1, noise: 40, rootWalls: 5, innerWalls: 2 },
  normal: { label: 'Normaal', depth: 2, noise: 8, rootWalls: 8, innerWalls: 3 },
  hard: { label: 'Moeilijk', depth: 3, noise: 3, rootWalls: 8, innerWalls: 3 },
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

// De beste muur-kandidaten: vakjes die onze beweeglijkheid vergroten en die van de tegenstander verkleinen.
function wallCandidates(state, limit) {
  const me = state.pendingWall
  const opp = me === 'w' ? 'b' : 'w'
  const scored = []
  for (let sq = 0; sq < 64; sq++) {
    if (!isFreeSquare(state, sq)) continue
    const walls = state.walls.slice()
    walls[sq] = true
    const s = { ...state, walls }
    scored.push({ sq, score: mobility(s, me) - mobility(s, opp) })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((x) => x.sq)
}

function actionsFor(state, wallLimit) {
  if (state.pendingWall) {
    return [
      { type: 'skip' },
      ...wallCandidates(state, wallLimit).map((sq) => ({ type: 'wall', sq })),
    ]
  }
  const moves = allLegalMoves(state)
  // slagzetten eerst voor snellere alpha-beta
  moves.sort((a, b) => (b.capture ? 1 : 0) - (a.capture ? 1 : 0))
  return moves.map((move) => ({ type: 'move', move }))
}

function apply(state, a) {
  if (a.type === 'move') return makeMove(state, a.move, true)
  if (a.type === 'wall') return placeWall(state, a.sq, true)
  return skipWall(state, true)
}

function search(state, depth, alpha, beta, level) {
  if (depth <= 0 && !state.pendingWall) return evaluate(state, state.turn)
  const acts = actionsFor(state, level.innerWalls)
  if (acts.length === 0) {
    return inCheck(state, state.turn) ? -100000 - depth : 0
  }
  let best = -Infinity
  for (const a of acts) {
    const next = apply(state, a)
    let score
    if (next.turn === state.turn) {
      // bijv. na het plaatsen van een muur: dezelfde speler is nog aan zet
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
  const acts = actionsFor(state, level.rootWalls)
  if (acts.length === 0) return null
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
    score += (Math.random() - 0.5) * 2 * level.noise
    if (score > bestScore) {
      bestScore = score
      bestAct = a
    }
  }
  return bestAct
}
