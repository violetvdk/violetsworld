// Online spelen via een code. Geen eigen server nodig: spelers verbinden direct
// (WebRTC) en PeerJS' gratis publieke broker regelt alleen het kennismaken.
import { Peer } from 'peerjs'

const PREFIX = 'muurschaak-'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // geen 0/O/1/I

function randomCode(len = 5) {
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

export const cleanCode = (c) => c.toUpperCase().replace(/[^A-Z0-9]/g, '')

// Handlers: { onCode, onConnected, onAction, onDisconnected, onError }
// Geeft { send, close } terug. De host speelt wit, de gast zwart.
export function hostGame(h, attempt = 0) {
  const code = randomCode()
  const peer = new Peer(PREFIX + code)
  let conn = null
  let closed = false

  peer.on('open', () => h.onCode(code))
  peer.on('disconnected', () => {
    // De verbinding met de PeerJS-server viel weg (bijv. tab op de achtergrond): opnieuw koppelen zodat de code geldig blijft.
    if (!closed && !peer.destroyed) peer.reconnect()
  })
  peer.on('error', (err) => {
    if (err.type === 'unavailable-id' && attempt < 5) {
      peer.destroy()
      const next = hostGame(h, attempt + 1)
      api.send = next.send
      api.close = next.close
    } else if (!closed) {
      h.onError('Kon geen spel aanmaken. Probeer het nog eens.')
    }
  })
  peer.on('connection', (c) => {
    if (conn) {
      c.close() // er speelt al iemand mee
      return
    }
    conn = c
    c.on('open', () => h.onConnected())
    c.on('data', (d) => h.onAction(d))
    c.on('close', () => {
      conn = null
      if (!closed) h.onDisconnected()
    })
  })

  const api = {
    send: (msg) => conn && conn.open && conn.send(msg),
    close: () => {
      closed = true
      peer.destroy()
    },
  }
  return api
}

export function joinGame(rawCode, h) {
  const code = cleanCode(rawCode)
  const peer = new Peer()
  let conn = null
  let closed = false
  let connected = false

  const timeout = setTimeout(() => {
    if (!connected && !closed) h.onError('Geen antwoord. Klopt de code?')
  }, 12000)

  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true })
    conn.on('open', () => {
      connected = true
      clearTimeout(timeout)
      h.onConnected()
    })
    conn.on('data', (d) => h.onAction(d))
    conn.on('close', () => {
      if (!closed) h.onDisconnected()
    })
  })
  peer.on('error', (err) => {
    clearTimeout(timeout)
    if (closed) return
    h.onError(
      err.type === 'peer-unavailable'
        ? 'Deze code bestaat niet (meer).'
        : 'Verbinden mislukt. Probeer het nog eens.'
    )
  })

  return {
    send: (msg) => conn && conn.open && conn.send(msg),
    close: () => {
      closed = true
      clearTimeout(timeout)
      peer.destroy()
    },
  }
}
