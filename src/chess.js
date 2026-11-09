// Schaak-engine met muren.
// Bord: array van 64 vakjes, index = rij * 8 + kolom, rij 0 = bovenaan (rank 8).
// Stuk: { t: 'p'|'n'|'b'|'r'|'q'|'k', c: 'w'|'b' }
// Muren: boolean-array van 64. Op een muur kan niemand staan of lopen;
// lopers/torens/dame kunnen er niet doorheen, paarden springen er wel overheen.

const row = (i) => i >> 3
const col = (i) => i & 7
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8
const other = (c) => (c === 'w' ? 'b' : 'w')

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export function newGame() {
  const board = Array(64).fill(null)
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  for (let c = 0; c < 8; c++) {
    board[c] = { t: back[c], c: 'b' }
    board[8 + c] = { t: 'p', c: 'b' }
    board[48 + c] = { t: 'p', c: 'w' }
    board[56 + c] = { t: back[c], c: 'w' }
  }
  const state = {
    board,
    walls: Array(64).fill(false),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, // vakje waar en passant geslagen kan worden
    pendingWall: null, // kleur die nog een muur mag plaatsen
    status: 'playing', // playing | checkmate | stalemate | draw
    reason: null, // uitleg bij een remise
    winner: null,
    lastMove: null,
    halfmove: 0, // zetten sinds laatste slag of pionzet (50-zettenregel)
    history: {}, // stellingen -> aantal keer gezien (herhaling)
    captured: { w: [], b: [] }, // stukken die die kleur verloren heeft
  }
  state.history = { [positionKey(state)]: 1 }
  return state
}

function isFree(state, i) {
  return !state.board[i] && !state.walls[i]
}

// Wordt vakje `sq` aangevallen door kleur `by`?
export function isAttacked(state, sq, by) {
  const { board, walls } = state
  const r = row(sq)
  const c = col(sq)

  // pionnen: een witte pion op (r+1) valt omhoog aan
  const pr = by === 'w' ? r + 1 : r - 1
  for (const dc of [-1, 1]) {
    if (onBoard(pr, c + dc)) {
      const p = board[pr * 8 + c + dc]
      if (p && p.c === by && p.t === 'p') return true
    }
  }
  for (const [dr, dc] of KNIGHT) {
    if (onBoard(r + dr, c + dc)) {
      const p = board[(r + dr) * 8 + c + dc]
      if (p && p.c === by && p.t === 'n') return true
    }
  }
  for (const [dr, dc] of KING) {
    if (onBoard(r + dr, c + dc)) {
      const p = board[(r + dr) * 8 + c + dc]
      if (p && p.c === by && p.t === 'k') return true
    }
  }
  const slide = (dirs, kinds) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr
      let cc = c + dc
      while (onBoard(rr, cc)) {
        const i = rr * 8 + cc
        if (walls[i]) break
        const p = board[i]
        if (p) {
          if (p.c === by && kinds.includes(p.t)) return true
          break
        }
        rr += dr
        cc += dc
      }
    }
    return false
  }
  return slide(DIAG, ['b', 'q']) || slide(ORTHO, ['r', 'q'])
}

function findKing(state, color) {
  return state.board.findIndex((p) => p && p.t === 'k' && p.c === color)
}

export function inCheck(state, color) {
  const k = findKing(state, color)
  return k !== -1 && isAttacked(state, k, other(color))
}

// Alle zetten zonder te kijken of de eigen koning in schaak komt te staan.
function pseudoMoves(state, from) {
  const { board, walls } = state
  const piece = board[from]
  if (!piece) return []
  const me = piece.c
  const r = row(from)
  const c = col(from)
  const moves = []
  const add = (to, extra = {}) => moves.push({ from, to, ...extra })

  if (piece.t === 'p') {
    const dir = me === 'w' ? -1 : 1
    const startRow = me === 'w' ? 6 : 1
    const lastRow = me === 'w' ? 0 : 7
    const promo = (to) => row(to) === lastRow
    const one = (r + dir) * 8 + c
    if (onBoard(r + dir, c) && isFree(state, one)) {
      add(one, promo(one) ? { promotion: 'q' } : {})
      const two = (r + 2 * dir) * 8 + c
      if (r === startRow && isFree(state, two)) add(two, { double: true })
    }
    for (const dc of [-1, 1]) {
      if (!onBoard(r + dir, c + dc)) continue
      const to = (r + dir) * 8 + c + dc
      const target = board[to]
      if (target && target.c !== me) {
        add(to, { capture: true, ...(promo(to) ? { promotion: 'q' } : {}) })
      } else if (state.ep === to && !walls[to]) {
        add(to, { capture: true, enPassant: true })
      }
    }
    return moves
  }

  if (piece.t === 'n' || piece.t === 'k') {
    const steps = piece.t === 'n' ? KNIGHT : KING
    for (const [dr, dc] of steps) {
      const rr = r + dr
      const cc = c + dc
      if (!onBoard(rr, cc)) continue
      const to = rr * 8 + cc
      if (walls[to]) continue
      const target = board[to]
      if (!target) add(to)
      else if (target.c !== me) add(to, { capture: true })
    }
    if (piece.t === 'k') {
      const homeRow = me === 'w' ? 7 : 0
      if (from === homeRow * 8 + 4 && !isAttacked(state, from, other(me))) {
        const rights = state.castling
        const base = homeRow * 8
        // korte rochade
        if (
          rights[me + 'K'] &&
          board[base + 7]?.t === 'r' &&
          isFree(state, base + 5) &&
          isFree(state, base + 6) &&
          !isAttacked(state, base + 5, other(me)) &&
          !isAttacked(state, base + 6, other(me))
        ) add(base + 6, { castle: 'K' })
        // lange rochade
        if (
          rights[me + 'Q'] &&
          board[base]?.t === 'r' &&
          isFree(state, base + 1) &&
          isFree(state, base + 2) &&
          isFree(state, base + 3) &&
          !isAttacked(state, base + 3, other(me)) &&
          !isAttacked(state, base + 2, other(me))
        ) add(base + 2, { castle: 'Q' })
      }
    }
    return moves
  }

  const dirs =
    piece.t === 'b' ? DIAG : piece.t === 'r' ? ORTHO : [...DIAG, ...ORTHO]
  for (const [dr, dc] of dirs) {
    let rr = r + dr
    let cc = c + dc
    while (onBoard(rr, cc)) {
      const to = rr * 8 + cc
      if (walls[to]) break
      const target = board[to]
      if (!target) add(to)
      else {
        if (target.c !== me) add(to, { capture: true })
        break
      }
      rr += dr
      cc += dc
    }
  }
  return moves
}

// Voert een zet uit en geeft de nieuwe state terug (zonder status/wall-fase).
function rawApply(state, move) {
  const board = state.board.slice()
  const piece = board[move.from]
  const me = piece.c
  const castling = { ...state.castling }
  let capturedPiece = board[move.to]
  let ep = null

  board[move.to] = piece
  board[move.from] = null

  if (move.enPassant) {
    const capSq = move.to + (me === 'w' ? 8 : -8)
    capturedPiece = board[capSq]
    board[capSq] = null
  }
  if (move.promotion) board[move.to] = { t: move.promotion, c: me }
  if (move.double) ep = (move.from + move.to) / 2

  if (move.castle) {
    const base = row(move.from) * 8
    if (move.castle === 'K') {
      board[base + 5] = board[base + 7]
      board[base + 7] = null
    } else {
      board[base + 3] = board[base]
      board[base] = null
    }
  }

  // rochaderechten bijwerken
  if (piece.t === 'k') {
    castling[me + 'K'] = false
    castling[me + 'Q'] = false
  }
  const corners = { 56: 'wQ', 63: 'wK', 0: 'bQ', 7: 'bK' }
  if (corners[move.from]) castling[corners[move.from]] = false
  if (corners[move.to]) castling[corners[move.to]] = false

  const halfmove = piece.t === 'p' || capturedPiece ? 0 : state.halfmove + 1
  return { ...state, board, castling, ep, halfmove, capturedPiece }
}

// Alle legale zetten voor de speler die aan zet is (negeert de muur-fase).
export function allLegalMoves(state) {
  const out = []
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (p && p.c === state.turn) {
      for (const m of pseudoMoves(state, i)) {
        if (!inCheck(rawApply(state, m), p.c)) out.push(m)
      }
    }
  }
  return out
}

export function legalMoves(state, from) {
  const piece = state.board[from]
  if (!piece || piece.c !== state.turn || state.status !== 'playing') return []
  if (state.pendingWall) return []
  return pseudoMoves(state, from).filter((m) => {
    const next = rawApply(state, m)
    return !inCheck(next, piece.c)
  })
}

function hasAnyLegalMove(state) {
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (p && p.c === state.turn) {
      for (const m of pseudoMoves(state, i)) {
        if (!inCheck(rawApply(state, m), p.c)) return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------- einde van het spel

export function positionKey(state) {
  const b = state.board.map((p) => (p ? (p.c === 'w' ? p.t.toUpperCase() : p.t) : '.')).join('')
  const w = state.walls.map((x) => (x ? '#' : '.')).join('')
  const c = state.castling
  return `${b}|${w}|${state.turn}|${+c.wK}${+c.wQ}${+c.bK}${+c.bQ}|${state.ep ?? '-'}`
}

const squareColor = (i) => (row(i) + col(i)) & 1

// Standaard remise door te weinig materiaal.
function insufficientMaterial(state) {
  const rest = []
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (p && p.t !== 'k') rest.push({ ...p, sq: i })
  }
  if (rest.length === 0) return true
  if (rest.length === 1 && (rest[0].t === 'n' || rest[0].t === 'b')) return true
  // alleen lopers, allemaal op dezelfde kleur vakjes
  if (rest.every((p) => p.t === 'b')) {
    const first = squareColor(rest[0].sq)
    if (rest.every((p) => squareColor(p.sq) === first)) return true
  }
  return false
}

// Vakjes waar een koning ooit kan komen (door muren afgesloten gebied, stukken genegeerd).
function kingRegion(state, color) {
  const start = findKing(state, color)
  const seen = new Set()
  if (start === -1) return seen
  const queue = [start]
  seen.add(start)
  while (queue.length) {
    const sq = queue.pop()
    for (const [dr, dc] of KING) {
      const r = row(sq) + dr
      const c = col(sq) + dc
      if (!onBoard(r, c)) continue
      const to = r * 8 + c
      if (state.walls[to] || seen.has(to)) continue
      seen.add(to)
      queue.push(to)
    }
  }
  return seen
}

// Alle vakjes waar een stuk ooit zou kunnen komen als alleen de muren in de weg staan (optimistisch).
function reachFrom(state, starts, type) {
  const seen = new Set(starts)
  const queue = [...starts]
  while (queue.length) {
    const sq = queue.pop()
    const r = row(sq)
    const c = col(sq)
    const push = (to) => {
      if (!seen.has(to)) {
        seen.add(to)
        queue.push(to)
      }
    }
    if (type === 'n') {
      for (const [dr, dc] of KNIGHT) {
        if (onBoard(r + dr, c + dc) && !state.walls[(r + dr) * 8 + c + dc]) push((r + dr) * 8 + c + dc)
      }
    } else {
      const dirs = type === 'b' ? DIAG : type === 'r' ? ORTHO : [...DIAG, ...ORTHO]
      for (const [dr, dc] of dirs) {
        let rr = r + dr
        let cc = c + dc
        while (onBoard(rr, cc) && !state.walls[rr * 8 + cc]) {
          push(rr * 8 + cc)
          rr += dr
          cc += dc
        }
      }
    }
  }
  return seen
}

// Vanaf welke vakjes in `from` wordt minstens één vakje van `targets` aangevallen?
function attacksAny(state, from, type, targets, color) {
  for (const sq of from) {
    const r = row(sq)
    const c = col(sq)
    if (type === 'n') {
      for (const [dr, dc] of KNIGHT) {
        if (onBoard(r + dr, c + dc) && targets.has((r + dr) * 8 + c + dc)) return true
      }
    } else if (type === 'p') {
      const dr = color === 'w' ? -1 : 1
      for (const dc of [-1, 1]) {
        if (onBoard(r + dr, c + dc) && targets.has((r + dr) * 8 + c + dc)) return true
      }
    } else {
      const dirs = type === 'b' ? DIAG : type === 'r' ? ORTHO : [...DIAG, ...ORTHO]
      for (const [dr, dc] of dirs) {
        let rr = r + dr
        let cc = c + dc
        while (onBoard(rr, cc) && !state.walls[rr * 8 + cc]) {
          if (targets.has(rr * 8 + cc)) return true
          rr += dr
          cc += dc
        }
      }
    }
  }
  return false
}

// Kan `color` de vijandelijke koning nog ooit schaak zetten (en dus mat)? Optimistisch:
// zegt alleen "nee" als het ook zonder tegenstander in de weg onmogelijk is.
function canStillMate(state, color) {
  const targets = kingRegion(state, other(color))
  if (targets.size === 0) return false
  const lastRow = color === 'w' ? 0 : 7
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (!p || p.c !== color || p.t === 'k') continue
    if (p.t === 'p') {
      // pion loopt vooruit/slaat schuin; bij promotie komt er een dame of paard
      const dir = color === 'w' ? -1 : 1
      const seen = new Set([i])
      const queue = [i]
      const promoted = new Set()
      while (queue.length) {
        const sq = queue.pop()
        const r = row(sq)
        const c = col(sq)
        if (r === lastRow) {
          promoted.add(sq)
          continue
        }
        for (const dc of [-1, 0, 1]) {
          const rr = r + dir
          const cc = c + dc
          if (!onBoard(rr, cc)) continue
          const to = rr * 8 + cc
          if (state.walls[to] || seen.has(to)) continue
          seen.add(to)
          queue.push(to)
        }
      }
      if (attacksAny(state, seen, 'p', targets, color)) return true
      if (promoted.size) {
        const q = reachFrom(state, [...promoted], 'q')
        const n = reachFrom(state, [...promoted], 'n')
        if (attacksAny(state, q, 'q', targets, color)) return true
        if (attacksAny(state, n, 'n', targets, color)) return true
      }
    } else {
      const reach = reachFrom(state, [i], p.t)
      if (attacksAny(state, reach, p.t, targets, color)) return true
    }
  }
  return false
}

export function isDeadPosition(state) {
  return !canStillMate(state, 'w') && !canStillMate(state, 'b')
}

// Wordt na elke beurt aangeroepen: mat, pat, en of een winst nog mogelijk is.
function evaluate(state, fast = false) {
  if (fast) return state
  // Zolang er nog een muur geplaatst mag worden is het spel niet afgelopen (een muur kan een schaak blokkeren).
  if (state.pendingWall) return { ...state, status: 'playing', winner: null, reason: null }

  const key = positionKey(state)
  const seenCount = (state.history[key] || 0) + 1
  const s = { ...state, history: { ...state.history, [key]: seenCount } }

  if (!hasAnyLegalMove(s)) {
    if (inCheck(s, s.turn)) return { ...s, status: 'checkmate', winner: other(s.turn), reason: null }
    return { ...s, status: 'stalemate', winner: null, reason: 'Pat' }
  }
  const draw = (reason) => ({ ...s, status: 'draw', winner: null, reason })
  if (insufficientMaterial(s)) return draw('Onvoldoende materiaal om mat te zetten')
  if (isDeadPosition(s)) return draw('Niemand kan nog mat zetten (door de muren)')
  if (s.halfmove >= 100) return draw('50 zetten zonder slag of pionzet')
  if (seenCount >= 3) return draw('Dezelfde stelling voor de derde keer')
  return { ...s, status: 'playing', winner: null, reason: null }
}

export function makeMove(state, move, fast = false) {
  const me = state.turn
  const moved = rawApply(state, move)
  const { capturedPiece, ...rest } = moved
  let next = { ...rest, lastMove: { from: move.from, to: move.to } }

  if (capturedPiece) {
    // De speler die een stuk verliest mag een muur plaatsen.
    next.captured = {
      ...state.captured,
      [capturedPiece.c]: [...state.captured[capturedPiece.c], capturedPiece.t],
    }
    next.turn = other(me)
    next.pendingWall = other(me)
  } else {
    next.turn = other(me)
    next.pendingWall = null
  }
  return evaluate(next, fast)
}

export function canPlaceWall(state, sq) {
  return !!state.pendingWall && isFree(state, sq)
}

export function placeWall(state, sq, fast = false) {
  if (!canPlaceWall(state, sq)) return state
  const walls = state.walls.slice()
  walls[sq] = true
  return evaluate({ ...state, walls, pendingWall: null }, fast)
}

export function skipWall(state, fast = false) {
  if (!state.pendingWall) return state
  return evaluate({ ...state, pendingWall: null }, fast)
}

export const squareName = (i) => 'abcdefgh'[col(i)] + (8 - row(i))

// Een actie is { type: 'move', move } | { type: 'wall', sq } | { type: 'skip' }.
// Geeft null terug als de actie niet toegestaan is (handig voor online spel).
export function applyAction(state, action, fast = false) {
  if (state.status !== 'playing') return null
  if (action.type === 'move') {
    if (state.pendingWall) return null
    const m = legalMoves(state, action.move.from).find((x) => x.to === action.move.to)
    return m ? makeMove(state, m, fast) : null
  }
  if (action.type === 'wall') {
    return canPlaceWall(state, action.sq) ? placeWall(state, action.sq, fast) : null
  }
  if (action.type === 'skip') {
    return state.pendingWall ? skipWall(state, fast) : null
  }
  return null
}

// Aantal pseudo-zetten van een kleur (gebruikt door de computer om muren te beoordelen).
export function mobility(state, color) {
  let n = 0
  for (let i = 0; i < 64; i++) {
    const p = state.board[i]
    if (p && p.c === color) n += pseudoMoves(state, i).length
  }
  return n
}

export function isFreeSquare(state, i) {
  return isFree(state, i)
}
