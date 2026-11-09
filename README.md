# Muurschaak 🧱

Schaken in React, met een twist: verlies je een stuk, dan mag je een muur plaatsen op een leeg vakje. Op een muur kan niemand staan of doorheen lopen (paarden springen eroverheen).

- 🤖 Tegen de computer (makkelijk / normaal / moeilijk)
- 🌍 Online met een code (peer-to-peer via PeerJS, geen eigen server nodig)
- 👥 Twee spelers op één scherm

## Starten

```bash
npm install
npm run dev
```

## Online

Eén speler kiest "Spel maken" en krijgt een code, de ander voert die in bij "Meedoen". De host speelt wit.

## Deploy

Elke push naar `main` wordt via GitHub Actions naar GitHub Pages gezet.
