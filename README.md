# OpenChalk

OpenChalk is a whiteboard you talk to. Name a topic and it teaches it out loud while it draws pictures, labels, and short keypoints on the board. Interrupt it at any time with a question, and it answers and then carries on.

It runs in the browser on [Gemini Live](https://ai.google.dev/gemini-api/docs/live). The model chooses what to show. OpenChalk's own code handles layout and drawing, so the board stays tidy.

## Features

- **Spoken lessons.** You get one continuous lesson rather than question-and-answer turns. Speak at any time to interrupt.
- **Notes as it talks.** Dates, names, numbers, and definitions are written on the board as they are said.
- **Pictures that match.** About 1,900 built-in line icons. Words not in that set are searched on Iconify. Real places, animals, and textbook diagrams come from Wikimedia Commons, with credit shown.
- **Two modes.** **Tutor** teaches. **Presenter** draws only what you dictate.
- **Controls.** Undo, clear, save as an image, and tap any picture to ask about it.

## Quick start

You need [Node.js](https://nodejs.org) 20.9 or newer, a recent Chrome or Edge, and a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/sc-lacanlale/OpenChalk.git openchalk
cd openchalk
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Open `.env` and paste your key after `GEMINI_API_KEY=`. Then:

```bash
npm run dev
```

Go to http://localhost:3000, press **Start**, and allow the microphone. Wear headphones so the mic does not pick up the board's voice and treat it as an interruption.

Try "Teach me how a bill becomes law" or one of the suggested topics. You can type in the box instead of speaking.

## Using it

| Control               | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| **Start / Stop**      | Opens or closes the live session.                                       |
| **Tutor / Presenter** | Tutor gives a lesson. Presenter draws what you dictate and keeps quiet. |
| **Auto**              | Keeps a lesson moving when you go quiet. Click to pause.                |
| **Undo**              | Removes the last picture or note.                                       |
| **New**               | Clears the board.                                                       |
| **Save**              | Downloads the board as `openchalk.jpg`.                                 |
| **Mic**               | Mutes your microphone. Typing still works.                              |
| **Hide**              | Hides the chat panel to give the board more room.                       |

## Configuration

All settings go in `.env`, which git never commits.

| Variable          | Default                         | Meaning                                                                                                                              |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`  | none, required                  | Your Gemini key. Only the server reads it.                                                                                           |
| `GEMINI_MODEL`    | `gemini-3.1-flash-live-preview` | The Gemini Live model. If Google renames it, copy the new name from the [Live API docs](https://ai.google.dev/gemini-api/docs/live). |
| `TOKENS_PER_HOUR` | `30`                            | How many sessions one IP address may start per hour.                                                                                 |
| `ALLOW_RAW_KEY`   | `0`                             | Local debugging only. `1` sends the raw key to the browser. Production builds ignore it.                                             |

## Deploying

```bash
npm run build
npm start
```

This runs on any Node host. On Vercel, import the repository and add the same variables under Project Settings, Environment Variables.

Before you make a deployment public:

- **Anyone who can open the site can spend your Gemini quota.** The server only hands out one-use tokens that last 30 minutes, it refuses requests from other websites, and it caps sessions per IP. Even so, set a spending limit on your Google AI Studio key, and put a login in front of the site if it should not be open to everyone.
- **The rate limit is kept in each server process's memory.** When you run several instances, each one counts separately. Add your host's rate limiting for a hard cap.
- **Serve the site over HTTPS.** Browsers block the microphone on plain HTTP pages, except on `localhost`.

## How it works

```
Browser                                Server (Next.js)
 mic ── 16 kHz audio ──► Gemini Live ◄── /api/token  mints a one-use token from your key
 speaker ◄── voice ───── (WebSocket)
 board ◄── draw calls ──┘                /api/icon   finds line icons on Iconify
                                         /api/photo  finds photos and diagrams on Wikimedia Commons
```

The model never sends coordinates. It names what to show, such as a picture of lungs labelled "Lungs" or a keypoint "Founded 1611". The board engine decides where it goes, records it, and queues the drawing so the pen moves in time with the voice.

| Where                                              | What it does                                                                                            | Change it to...                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/engine/prompts.ts`                            | Tutor and Presenter instructions                                                                        | change how it teaches                                  |
| `src/engine/board/tools.ts`                        | The tools the model can call, with their descriptions                                                   | add or reword a tool                                   |
| `src/engine/board/index.ts`                        | One handler per tool, the pen queue, Undo, New and Save                                                 | change what a tool does                                |
| `src/engine/board/pieces.ts`                       | Builds and animates each kind of board item: title, picture, photo, label, link, note, flow node, chart | change how something looks or animates                 |
| `src/engine/board/layout.ts`                       | Slots, sizes, columns, and outline and arrow geometry                                                   | move things around                                     |
| `src/engine/board/coach.ts`                        | The board description and the one-line coaching sent back after every tool call                         | steer pacing, such as more notes or an earlier wrap-up |
| `src/engine/board/ink.ts`                          | SVG primitives: pen strokes, handwriting reveal, fades                                                  | change the drawing feel                                |
| `src/engine/board/args.ts`, `style.ts`, `state.ts` | Argument cleanup, colours and font, board state types                                                   |                                                        |
| `src/engine/pictures.ts`, `motifs.ts`, `icons.ts`  | Turn a word into a drawing: Lucide icons, hand-drawn motifs, synonyms                                   | add synonyms or shapes                                 |
| `src/engine/live/index.ts`                         | The session: connect, reconnect, interruptions, Auto, and the page controls                             | change session behaviour                               |
| `src/engine/live/protocol.ts`                      | Gemini Live message formats                                                                             | follow an API change                                   |
| `src/engine/live/audio.ts`                         | Microphone capture and voice playback                                                                   |                                                        |
| `src/engine/live/transcript.ts`                    | The chat panel and live captions                                                                        |                                                        |
| `src/components/whiteboard.tsx`                    | The page markup                                                                                         | change the page layout                                 |
| `src/app/api/*`                                    | The three server routes in the diagram above                                                            |                                                        |

`icons.ts` is generated data. Do not edit it by hand.

The board is not streamed to the model as video, because video input cuts a Live session to about 2 minutes. Instead, every draw call returns a text list of what is on the board.

## Troubleshooting

| Problem                            | Fix                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| "The server has no GEMINI_API_KEY" | Add the key to `.env` and restart `npm run dev`.                       |
| "Gemini refused the token request" | The key is wrong, or it has no Live API access. Check it in AI Studio. |
| It connects, then drops at once    | The model name is out of date. Update `GEMINI_MODEL`.                  |
| It keeps interrupting itself       | The mic is hearing the speaker. Use headphones.                        |
| No microphone prompt               | Use `localhost` or HTTPS, and check the browser's site permissions.    |
| A picture shows a plain blob       | No icon matched that word. The label still says what it is.            |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## Credits

- Voice and reasoning: [Gemini Live API](https://ai.google.dev/gemini-api/docs/live)
- Built-in icons: [Lucide](https://lucide.dev) (ISC)
- Extra icons, via [Iconify](https://iconify.design): Tabler, Phosphor, Iconoir, and Health Icons (MIT); Material Design Icons, Material Symbols, and Carbon (Apache-2.0)
- Photos and diagrams: [Wikimedia Commons](https://commons.wikimedia.org), credited on the board
- Handwriting font: [Caveat](https://github.com/googlefonts/caveat) (SIL Open Font License, see `public/fonts/OFL-Caveat.txt`)

## License

[MIT](LICENSE)
