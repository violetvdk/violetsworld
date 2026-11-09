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
  return {
    board,
    walls: Array(64).fill(false),
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, // vakje waar en passant geslagen kan worden
    pendingWall: null, // kleur die nog een muur mag plaatsen
    status: 'playing', // playing | checkmate | stalemate
    winner: null,
    lastMove: null,
    captured: { w: [], b: [] }, // stukken die die kleur verloren heeft
  }
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

  return { ...state, board, castling, ep, capturedPiece }
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

// Bepaalt of het spel afgelopen is (alleen als er geen muur meer te plaatsen valt).
function evaluate(state, fast = false) {
  if (fast) return state
  if (state.pendingWall) return { ...state, status: 'playing', winner: null }
  if (hasAnyLegalMove(state)) return { ...state, status: 'playing', winner: null }
  if (inCheck(state, state.turn)) {
    return { ...state, status: 'checkmate', winner: other(state.turn) }
  }
  return { ...state, status: 'stalemate', winner: null }
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
