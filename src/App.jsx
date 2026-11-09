import { useEffect, useMemo, useRef, useState } from 'react'
import {
  newGame,
  legalMoves,
  applyAction,
  canPlaceWall,
  inCheck,
  squareName,
} from './chess.js'
import { chooseAction, LEVELS } from './ai.js'
import { hostGame, joinGame, cleanCode } from './online.js'
import { Piece, Wall, SketchDefs } from './pieces.jsx'

const NAME = { w: 'Wit', b: 'Zwart' }
const opposite = (c) => (c === 'w' ? 'b' : 'w')

export default function App() {
  const [session, setSession] = useState(null) // { mode, myColor, level, net }
  const [opponentLeft, setOpponentLeft] = useState(false)

  // Berichten van de online tegenstander worden hier gebufferd tot het spel klaar staat.
  const incoming = useRef({ fn: null, queue: [] })
  const incomingApi = useMemo(
    () => ({
      push(action) {
        const box = incoming.current
        if (box.fn) box.fn(action)
        else box.queue.push(action)
      },
      register(fn) {
        const box = incoming.current
        box.fn = fn
        if (fn) {
          box.queue.forEach(fn)
          box.queue = []
        }
      },
    }),
    []
  )

  function start(s) {
    incoming.current = { fn: null, queue: [] }
    setOpponentLeft(false)
    setSession(s)
  }

  function exit() {
    session?.net?.close()
    setSession(null)
  }

  if (!session) {
    return (
      <>
        <SketchDefs />
        <Menu onStart={start} incomingApi={incomingApi} onLeft={() => setOpponentLeft(true)} />
      </>
    )
  }
  return (
    <>
    <SketchDefs />
    <Game
      key={session.id}
      {...session}
      incomingApi={incomingApi}
      opponentLeft={opponentLeft}
      onExit={exit}
    />
    </>
  )
}

/* ---------------------------------------------------------------- menu */

function Menu({ onStart, incomingApi, onLeft }) {
  const [level, setLevel] = useState('normal')
  const [color, setColor] = useState('w')
  const [lobby, setLobby] = useState(null) // null | { kind: 'host'|'join', code, error, busy }
  const [joinCode, setJoinCode] = useState('')
  const netRef = useRef(null)

  useEffect(() => () => netRef.current?.close(), [])

  function handlers(kind) {
    return {
      onCode: (code) => setLobby((l) => ({ ...l, code })),
      onConnected: () => {
        const net = netRef.current
        netRef.current = null // het spel neemt de verbinding over
        onStart({
          id: Date.now(),
          mode: 'online',
          myColor: kind === 'host' ? 'w' : 'b',
          net,
        })
      },
      onAction: (a) => incomingApi.push(a),
      onDisconnected: onLeft,
      onError: (error) => {
        netRef.current?.close()
        netRef.current = null
        setLobby({ kind, error })
      },
    }
  }

  function host() {
    netRef.current?.close()
    setLobby({ kind: 'host', code: null })
    netRef.current = hostGame(handlers('host'))
  }

  function join() {
    const code = cleanCode(joinCode)
    if (code.length < 4) return setLobby({ kind: 'join', error: 'Vul de code in.' })
    netRef.current?.close()
    setLobby({ kind: 'join', busy: true })
    netRef.current = joinGame(code, handlers('join'))
  }

  function cancel() {
    netRef.current?.close()
    netRef.current = null
    setLobby(null)
  }

  return (
    <div className="app">
      <h1 className="title">Chess</h1>
      <p className="subtitle">Verlies je een stuk? Dan zet je een muur neer.</p>

      <div className="menu">
        <section className="card">
          <h2>Tegen de computer</h2>
          <div className="row">
            <label>Niveau</label>
            <div className="seg">
              {Object.entries(LEVELS).map(([k, v]) => (
                <button key={k} className={level === k ? 'on' : ''} onClick={() => setLevel(k)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <label>Jij speelt</label>
            <div className="seg">
              <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')}>Wit</button>
              <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')}>Zwart</button>
            </div>
          </div>
          <button
            className="primary"
            onClick={() => onStart({ id: Date.now(), mode: 'ai', myColor: color, level })}
          >
            Spelen
          </button>
        </section>

        <section className="card">
          <h2>Online met een code</h2>
          {lobby?.kind === 'host' && !lobby.error ? (
            <div className="lobby">
              {lobby.code ? (
                <>
                  <p>Geef deze code aan je tegenstander:</p>
                  <div className="code">{lobby.code}</div>
                  <button onClick={() => navigator.clipboard?.writeText(lobby.code)}>Kopieer</button>
                  <p className="muted">Wachten op tegenstander… Jij speelt wit.</p>
                </>
              ) : (
                <p className="muted">Spel aanmaken…</p>
              )}
              <button onClick={cancel}>Annuleren</button>
            </div>
          ) : (
            <>
              <button className="primary" onClick={host}>Spel maken</button>
              <div className="or">of</div>
              <div className="row">
                <input
                  placeholder="CODE"
                  value={joinCode}
                  maxLength={8}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && join()}
                />
                <button onClick={join} disabled={lobby?.busy}>
                  {lobby?.busy ? 'Verbinden…' : 'Meedoen'}
                </button>
              </div>
            </>
          )}
          {lobby?.error && <p className="error">{lobby.error}</p>}
        </section>

        <section className="card">
          <h2>Twee spelers</h2>
          <p className="muted">Samen op hetzelfde scherm.</p>
          <button onClick={() => onStart({ id: Date.now(), mode: 'local', myColor: 'w' })}>
            Spelen
          </button>
        </section>
      </div>

      <Rules />
    </div>
  )
}

/* ---------------------------------------------------------------- spel */

function Game({ mode, myColor, level, net, incomingApi, opponentLeft, onExit }) {
  const [game, setGame] = useState(newGame)
  const [selected, setSelected] = useState(null)

  const online = mode === 'online'
  const myTurn = mode === 'local' || game.turn === myColor
  const canAct = game.status === 'playing' && myTurn && !(online && opponentLeft)
  const flipped = mode !== 'local' && myColor === 'b'

  // Zetten van de online tegenstander.
  useEffect(() => {
    if (!online) return
    incomingApi.register((action) => {
      if (action.type === 'reset') {
        setGame(newGame())
        setSelected(null)
        return
      }
      setGame((g) => {
        if (g.turn === myColor) return g // de tegenstander is niet aan de beurt
        return applyAction(g, action) ?? g
      })
    })
    return () => incomingApi.register(null)
  }, [online, myColor, incomingApi])

  // Zet van de computer.
  useEffect(() => {
    if (mode !== 'ai' || game.status !== 'playing' || game.turn === myColor) return
    const t = setTimeout(() => {
      const action = chooseAction(game, level)
      const next = action && applyAction(game, action)
      if (next) setGame(next)
    }, 350)
    return () => clearTimeout(t)
  }, [game, mode, myColor, level])

  function perform(action) {
    const next = applyAction(game, action)
    if (!next) return
    setGame(next)
    setSelected(null)
    if (online) net.send(action)
  }

  const moves = useMemo(
    () => (selected === null || !canAct ? [] : legalMoves(game, selected)),
    [game, selected, canAct]
  )
  const moveTo = useMemo(() => new Map(moves.map((m) => [m.to, m])), [moves])

  const checked = game.status === 'playing' && inCheck(game, game.turn)
  const kingInCheck = checked
    ? game.board.findIndex((p) => p && p.t === 'k' && p.c === game.turn)
    : -1
  const wallPhase = game.status === 'playing' && game.pendingWall
  const myWallPhase = wallPhase && canAct

  function onSquareClick(i) {
    if (!canAct) return
    if (wallPhase) {
      if (canPlaceWall(game, i)) perform({ type: 'wall', sq: i })
      return
    }
    const target = moveTo.get(i)
    if (target) {
      perform({ type: 'move', move: { from: target.from, to: target.to } })
      return
    }
    const p = game.board[i]
    setSelected(p && p.c === game.turn ? i : null)
  }

  function rematch() {
    setGame(newGame())
    setSelected(null)
    if (online) net.send({ type: 'reset' })
  }

  // Tekst bovenaan
  const who = (c) =>
    mode === 'local' ? NAME[c] : c === myColor ? 'Jij' : mode === 'ai' ? 'De computer' : 'Tegenstander'
  const me = (c) => mode !== 'local' && c === myColor
  let message
  if (online && opponentLeft && game.status === 'playing') {
    message = 'Je tegenstander heeft de verbinding verbroken.'
  } else if (game.status === 'checkmate') {
    const w = game.winner
    message = `Schaakmat! ${mode === 'local' ? `${NAME[w]} wint` : me(w) ? 'Jij wint' : `${who(w)} wint`}.`
  } else if (game.status === 'stalemate') {
    message = 'Pat — remise.'
  } else if (wallPhase) {
    const c = game.pendingWall
    message = me(c) || mode === 'local'
      ? `${who(c)} verloor een stuk: kies een leeg vakje voor een muur${checked ? ' (je staat schaak, een muur kan je redden)' : ''}.`
      : `${who(c)} mag een muur plaatsen…`
  } else if (mode === 'ai' && game.turn !== myColor) {
    message = 'De computer denkt na…'
  } else {
    const c = game.turn
    message = `${who(c)} ${me(c) ? 'bent' : 'is'} aan zet${checked ? ' — schaak!' : ''}`
  }

  const order = useMemo(() => {
    const a = Array.from({ length: 64 }, (_, i) => i)
    return flipped ? a.reverse() : a
  }, [flipped])
  const top = flipped ? 'w' : 'b'
  const bottom = opposite(top)

  return (
    <div className="app">
      <h1 className="title">Chess</h1>
      <div
        className={`banner ${myWallPhase ? 'banner-wall' : ''} ${
          game.status !== 'playing' ? 'banner-end' : ''
        } ${online && opponentLeft ? 'banner-bad' : ''}`}
      >
        <span>{message}</span>
        {myWallPhase && <button onClick={() => perform({ type: 'skip' })}>Geen muur</button>}
      </div>

      <Captured color={top} list={game.captured[top]} />

      <div className="boardwrap"><div className={`board ${myWallPhase ? 'board-wall' : ''}`}>
        {order.map((i, vi) => {
          const piece = game.board[i]
          const vr = vi >> 3
          const vc = vi & 7
          const dark = ((i >> 3) + (i & 7)) % 2 === 1
          const m = moveTo.get(i)
          const cls = [
            'square',
            dark ? 'dark' : 'light',
            selected === i ? 'selected' : '',
            game.lastMove && (game.lastMove.from === i || game.lastMove.to === i) ? 'last' : '',
            kingInCheck === i ? 'check' : '',
            myWallPhase && canPlaceWall(game, i) ? 'wallable' : '',
          ].join(' ')
          return (
            <div key={i} className={cls} onClick={() => onSquareClick(i)}>
              {vc === 0 && <span className="coord rank">{squareName(i)[1]}</span>}
              {vr === 7 && <span className="coord file">{squareName(i)[0]}</span>}
              {game.walls[i] && <Wall seed={i} />}
              {piece && <Piece type={piece.t} color={piece.c} seed={i} />}
              {m && <div className={m.capture ? 'hint-capture' : 'hint'} />}
            </div>
          )
        })}
      </div></div>

      <Captured color={bottom} list={game.captured[bottom]} />

      <div className="actions">
        {(mode !== 'online' || game.status !== 'playing') && (
          <button onClick={rematch}>Nieuw spel</button>
        )}
        <button onClick={onExit}>Menu</button>
      </div>

      <Rules />
    </div>
  )
}

function Captured({ color, list }) {
  // list = stukken die `color` heeft verloren
  return (
    <div className="captured">
      {list.map((t, i) => (
        <Piece key={i} type={t} color={color} seed={i} />
      ))}
      {list.length === 0 && <span className="muted">&nbsp;</span>}
    </div>
  )
}

function Rules() {
  return (
    <details className="rules">
      <summary>Regels</summary>
      <ul>
        <li>Normaal schaken (rochade, en passant en promotie naar dame inbegrepen).</li>
        <li>Wordt jouw stuk geslagen, dan mag jij vóór je zet één muur plaatsen op een leeg vakje (of overslaan).</li>
        <li>Op een muur kan niemand staan. Lopers, torens en dames kunnen er niet doorheen; paarden springen eroverheen.</li>
        <li>Muren blijven permanent staan en kunnen ook een schaak blokkeren.</li>
      </ul>
    </details>
  )
}
