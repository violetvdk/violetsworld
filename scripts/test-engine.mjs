// Draai met: npm test
import {
  newGame, allLegalMoves, makeMove, skipWall, placeWall, applyAction,
  legalMoves, inCheck, isDeadPosition, positionKey, kingEnclosed,
} from '../src/chess.js'
import { chooseAction } from '../src/ai.js'

let failed = 0
const ok = (cond, name) => {
  if (!cond) { failed++; console.log('FAIL', name) } else console.log('ok  ', name)
}

// ---- hulpfuncties
function fromFen(fen) {
  const [placement, turn, castle, ep] = fen.split(' ')
  const s = newGame()
  s.board = Array(64).fill(null)
  placement.split('/').forEach((rowStr, r) => {
    let c = 0
    for (const ch of rowStr) {
      if (/\d/.test(ch)) c += +ch
      else {
        s.board[r * 8 + c] = { t: ch.toLowerCase(), c: ch === ch.toUpperCase() ? 'w' : 'b' }
        c++
      }
    }
  })
  s.turn = turn
  s.castling = { wK: castle.includes('K'), wQ: castle.includes('Q'), bK: castle.includes('k'), bQ: castle.includes('q') }
  s.ep = ep && ep !== '-' ? (8 - +ep[1]) * 8 + 'abcdefgh'.indexOf(ep[0]) : null
  s.history = { [positionKey(s)]: 1 }
  return s
}
const sq = (n) => (8 - +n[1]) * 8 + 'abcdefgh'.indexOf(n[0])
const play = (s, from, to) => {
  const m = legalMoves(s, sq(from)).find((x) => x.to === sq(to))
  if (!m) throw new Error(`illegale zet ${from}${to}`)
  return makeMove(s, m)
}
function perft(s, d) {
  if (d === 0) return 1
  let n = 0
  for (const m of allLegalMoves(s)) {
    let nx = makeMove(s, m, true)
    if (nx.pendingWall) nx = skipWall(nx, true) // zonder muren = gewoon schaken
    n += perft(nx, d - 1)
  }
  return n
}

// ---- gewoon schaken (zonder muren) tegen bekende perft-getallen
const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
ok(perft(fromFen(startFen), 4) === 197281, 'perft startstelling diepte 4')
ok(perft(fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -'), 3) === 97862, 'perft Kiwipete diepte 3 (rochade, en passant, promotie)')
ok(perft(fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -'), 4) === 43238, 'perft positie 3 diepte 4')
// (positie 4 laten we weg: die telt ook onderpromoties, wij promoveren altijd naar dame)

// ---- muren
{
  // toren op a1, muur op a4: toren kan niet door
  let s = fromFen('4k3/8/8/8/8/8/8/R3K3 w - -')
  s.walls[sq('a4')] = true
  const to = legalMoves(s, sq('a1')).map((m) => m.to)
  ok(to.includes(sq('a3')) && !to.includes(sq('a4')) && !to.includes(sq('a5')), 'toren kan niet op of door een muur')
  // paard springt over een muur heen, maar staat niet op de muur
  s = fromFen('4k3/8/8/8/8/8/8/1N2K3 w - -')
  s.walls[sq('b3')] = true
  s.walls[sq('c3')] = true
  const kn = legalMoves(s, sq('b1')).map((m) => m.to)
  ok(kn.includes(sq('d2')) && kn.includes(sq('a3')), 'paard springt over een muur heen')
  const brk = legalMoves(s, sq('b1')).find((m) => m.to === sq('c3'))
  ok(brk && brk.breakWall, 'paard kan een muur breken')
  const after = makeMove(s, brk)
  ok(!after.walls[sq('c3')] && after.board[sq('c3')]?.t === 'n' && !after.pendingWall && after.turn === 'b', 'muur weg, paard staat erop, geen nieuwe muur')
  ok(after.walls[sq('b3')], 'andere muren blijven staan')
  // andere stukken kunnen geen muur breken
  const rook = fromFen('4k3/8/8/8/8/8/8/R3K3 w - -')
  rook.walls[sq('a3')] = true
  ok(!legalMoves(rook, sq('a1')).some((m) => m.to === sq('a3') || m.to === sq('a4')), 'toren kan geen muur breken')
  const king = fromFen('4k3/8/8/8/8/8/8/4K3 w - -')
  king.walls[sq('e2')] = true
  ok(!legalMoves(king, sq('e1')).some((m) => m.to === sq('e2')), 'koning kan geen muur breken')
  const bish = fromFen('4k3/8/8/8/8/8/8/2B1K3 w - -')
  bish.walls[sq('d2')] = true
  ok(!legalMoves(bish, sq('c1')).some((m) => m.to === sq('d2')), 'loper kan geen muur breken')
  // met een paard erbij is een ingemetselde stelling niet dood
  const knightAlive = fromFen('7k/8/8/8/8/8/8/R3K1N1 w - -')
  for (const n of ['a2', 'b2', 'b1']) knightAlive.walls[sq(n)] = true
  ok(!isDeadPosition(knightAlive), 'met een paard kunnen muren verdwijnen: niet dood')
  // pion kan niet de muur in
  s = fromFen('4k3/8/8/8/8/8/4P3/4K3 w - -')
  s.walls[sq('e3')] = true
  ok(legalMoves(s, sq('e2')).length === 0, 'pion geblokkeerd door muur (ook geen dubbele stap)')
  // rochade niet door een muur
  s = fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ -')
  s.walls[sq('f1')] = true
  const cas = legalMoves(s, sq('e1')).filter((m) => m.castle).map((m) => m.castle)
  ok(!cas.includes('K') && cas.includes('Q'), 'korte rochade geblokkeerd door muur, lange kan nog')
  // muur blokkeert een schaak op afstand
  s = fromFen('4k3/8/8/8/8/8/8/r3K3 w - -')
  ok(inCheck(s, 'w'), 'toren geeft schaak')
  s.walls[sq('c1')] = true
  ok(!inCheck(s, 'w'), 'muur blokkeert schaak')
  // paard-schaak kan niet geblokkeerd worden
  s = fromFen('4k3/8/8/8/8/3n4/8/4K3 w - -')
  s.walls[sq('e2')] = true
  s.walls[sq('d2')] = true
  ok(inCheck(s, 'w'), 'paard-schaak niet te blokkeren')
}

// ---- slaan geeft recht op een muur
{
  let s = newGame()
  s = play(s, 'e2', 'e4'); s = play(s, 'd7', 'd5'); s = play(s, 'e4', 'd5')
  ok(s.pendingWall === 'b' && s.turn === 'b', 'na een slag mag het slachtoffer een muur plaatsen')
  ok(applyAction(s, { type: 'move', move: { from: sq('a7'), to: sq('a6') } }) === null, 'eerst muur, nog geen zet')
  ok(applyAction(s, { type: 'wall', sq: sq('d5') }) === null, 'muur niet op bezet vakje')
  const s2 = applyAction(s, { type: 'wall', sq: sq('e6') })
  ok(s2 && s2.walls[sq('e6')] && !s2.pendingWall && s2.turn === 'b', 'muur geplaatst, zelfde speler zet daarna')
  const s3 = applyAction(s2, { type: 'move', move: { from: sq('e7'), to: sq('e6') } })
  ok(s3 === null, 'niemand kan op de muur')
  ok(applyAction(s2, { type: 'wall', sq: sq('a3') }) === null, 'maar één muur per slag')
  ok(applyAction(s, { type: 'skip' })?.pendingWall === null, 'muur overslaan kan')
}

// ---- en passant geeft ook een muur
{
  let s = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6')
  s = play(s, 'e5', 'd6')
  ok(s.pendingWall === 'b' && !s.board[sq('d5')], 'en passant: pion verdwijnt en slachtoffer mag een muur zetten')
}

// ---- mat kan door een muur worden gered
{
  // zwarte koning h8 staat schaak door toren op a8; muur op b8..g8 blokkeert
  let s = fromFen('R6k/6pp/8/8/8/8/8/4K3 b - -')
  s.pendingWall = 'b'
  s.turn = 'b'
  const dead = allLegalMoves(s).length === 0
  ok(dead, 'zwart heeft geen zet (schaak)')
  const walled = applyAction(s, { type: 'wall', sq: sq('d8') })
  ok(walled && walled.status === 'playing' && !inCheck(walled, 'b'), 'muur redt van mat, spel gaat door')
  const matted = applyAction(s, { type: 'skip' })
  ok(matted.status === 'checkmate' && matted.winner === 'w', 'zonder muur is het mat')
}

// ---- remise-controle elke beurt
{
  const k = fromFen('4k3/8/8/8/8/8/8/4K3 w - -')
  ok(isDeadPosition(k), 'koning tegen koning = dode stelling')
  const kb = fromFen('4k3/8/8/8/8/8/8/2B1K3 w - -')
  ok(!isDeadPosition(kb), 'K+L vs K is zonder muren heuristisch nog "mogelijk" (wel standaard remise via materiaal)')
  // materiaal: alleen K+L vs K -> remise na een zet
  let s = fromFen('4k3/8/8/8/8/8/8/2B1K3 w - -')
  s = play(s, 'e1', 'e2')
  ok(s.status === 'draw', 'K+L tegen K is remise (onvoldoende materiaal)')

  // toren zit helemaal ingemetseld: wit heeft alleen een toren in een afgesloten hoek, zwarte koning is ver weg
  let w = fromFen('7k/8/8/8/8/8/8/R3K3 w - -')
  for (const n of ['a2', 'b2', 'b1']) w.walls[sq(n)] = true
  // toren a1 is ingemetseld; verder alleen koningen -> niemand kan nog mat zetten
  ok(isDeadPosition(w), 'toren ingemetseld = niemand kan nog mat zetten')
  const moved = play(w, 'e1', 'e2')
  ok(moved.status === 'draw', 'dode stelling wordt na de zet gemeld als remise')

  // herhaling
  let r = fromFen('r3k3/8/8/8/8/8/8/R3K3 w - -')
  for (let i = 0; i < 2; i++) {
    r = play(r, 'e1', 'e2'); r = play(r, 'e8', 'e7'); r = play(r, 'e2', 'e1'); r = play(r, 'e7', 'e8')
  }
  ok(r.status === 'draw' && /derde/.test(r.reason), 'driemaal dezelfde stelling = remise')

  // 50-zettenregel
  const f = fromFen('r3k3/8/8/8/8/8/8/R3K3 w - -')
  f.halfmove = 99
  ok(play(f, 'e1', 'e2').status === 'draw', '50 zetten zonder slag/pion = remise')

  // pat
  const p = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - -')
  p.turn = 'b'
  p.pendingWall = 'b'
  const st = skipWall(p)
  ok(st.status === 'stalemate', 'pat wordt herkend')
}

// ---- koning inbouwen
{
  // zwarte koning in de hoek h8: muren op g8, g7, h7 bouwen hem in
  let s = fromFen('7k/8/8/8/8/8/8/4K2R w - -')
  s.walls[sq('g8')] = true
  s.walls[sq('g7')] = true
  ok(!kingEnclosed(s, 'b'), 'nog niet ingebouwd met 2 muren')
  s.pendingWall = 'w'
  const done = applyAction(s, { type: 'wall', sq: sq('h7') })
  ok(done.status === 'enclosed' && done.winner === 'w', 'vijandelijke koning ingebouwd = die speler wint')
  // jezelf inbouwen = verliezen
  let t2 = fromFen('7k/8/8/8/8/8/8/4K2R b - -')
  t2.walls[sq('g8')] = true
  t2.walls[sq('g7')] = true
  t2.pendingWall = 'b'
  const self = applyAction(t2, { type: 'wall', sq: sq('h7') })
  ok(self.status === 'enclosed' && self.winner === 'w', 'eigen koning inbouwen = verliezen')
  // computer maakt de laatste muur om te winnen en vermijdt zelf-inbouwen
  const a = chooseAction(s, 'normal')
  ok(a.type === 'wall' && a.sq === sq('h7'), 'computer bouwt de vijandelijke koning in om te winnen')
  const b = chooseAction(t2, 'hard')
  ok(!(b.type === 'wall' && b.sq === sq('h7')), 'computer bouwt zijn eigen koning niet in')
}

// ---- computer: alleen legale acties, plaatst muren, redt zichzelf van mat
{
  for (const lvl of ['easy', 'normal', 'hard']) {
    let s = newGame()
    let n = 0, walls = 0, bad = 0
    while (s.status === 'playing' && n < 120) {
      const a = chooseAction(s, lvl)
      if (!a) break
      if (a.type === 'wall') walls++
      const nx = applyAction(s, a)
      if (!nx) { bad++; break }
      s = nx; n++
    }
    ok(bad === 0, `computer (${lvl}) speelt alleen legale acties (${n} acties, ${walls} muren, status ${s.status})`)
  }
  // computer redt zich met een muur uit schaakmat
  let s = fromFen('R6k/6pp/8/8/8/8/8/4K3 b - -')
  s.turn = 'b'; s.pendingWall = 'b'
  const a = chooseAction(s, 'normal')
  ok(a.type === 'wall' && [sq('b8'), sq('c8'), sq('d8'), sq('e8'), sq('f8'), sq('g8')].includes(a.sq), 'computer blokkeert het schaak met een muur')
  // computer slaat gratis stuk (toren hangt) en zet mat in één
  let m = fromFen('6k1/5ppp/8/8/8/8/8/R3K3 w - -')
  const mv = chooseAction(m, 'normal')
  ok(mv.type === 'move' && mv.move.from === sq('a1') && mv.move.to === sq('a8'), 'computer ziet mat in één')
}

console.log(failed ? `\n${failed} test(s) mislukt` : '\nAlle tests geslaagd')
process.exit(failed ? 1 : 0)
