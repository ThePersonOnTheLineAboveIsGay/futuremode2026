# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Meet 會議小甜心 (Meet AI Interjector) — a Chrome extension + FastAPI backend that listens to a Google Meet call's audio, transcribes it to Traditional Chinese, and has an AI actively interject (not just passively flag) when it detects contradictions, off-topic drift, logical errors, or opinion-worthy decisions. Interjections appear as a floating card in the extension and are also posted into Meet's chat so non-extension participants see them too. All docs, code comments, prompts, and UI strings are in Traditional Chinese (Taiwan usage) — keep new user-facing text and log messages consistent with that.

The README.md (root) is the canonical spec for behavior, message formats, and known limitations — read it before making behavioral changes; this file only covers commands and architecture.

## Commands

Backend dev setup (Python 3.11 required):

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend/requirements-dev.txt
$env:PYTHONPATH = "backend"
pytest backend/tests
uvicorn app.main:app --app-dir backend --reload
```

A fresh PowerShell session sometimes has script execution disabled, which blocks `Activate.ps1` (`PSSecurityException: UnauthorizedAccess`). Skip activation entirely and call the venv's interpreter by path instead — this also sidesteps needing a new shell after installing something that touches PATH (e.g. ffmpeg via winget only takes effect in shells started after the install):

```powershell
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload
.venv\Scripts\python.exe -m pytest backend/tests
```

Optional — anonymous speaker clustering (`backend/app/diarization.py`, see its docstring and `backend/requirements-diarization.txt`). Skip this entirely and the backend runs exactly the same, just without pseudo-speaker labels for anonymous utterances:

```powershell
pip install --no-deps resemblyzer
pip install -r backend/requirements-diarization.txt
# also requires ffmpeg on PATH (decodes webm/opus for the embedding model)
```

Run a single test:

```powershell
pytest backend/tests/test_contradiction.py::test_name -v
```

Standalone STT check (mic → OpenRouter Whisper, no backend/Meet needed — requires `OPENROUTER_API_KEY` in `.env`):

```powershell
pip install -r backend\requirements.txt
python backend/testvoice.py                 # speak, see transcript printed
python backend/testvoice.py --list-devices
python backend/testvoice.py --device 1
python backend/testvoice.py --start-rms 0.01 --silence-rms 0.005 --silence-ms 800
```

Docker (backend only): `docker-compose up` (reads `.env`, exposes port 8000).

Extension: no build step. Load `extension/` unpacked via `chrome://extensions`; reload the extension and refresh the Meet tab after any change.

## Architecture

**Two independent halves that only talk over one WebSocket** (`/ws/meeting?meeting_id=...`): the Chrome extension never sees AI provider/model/API keys — those live only in the backend `.env`. Switching `AI_PROVIDER` or keys requires a backend restart; extension/audio/room code needs no changes for that.

**Meeting ID = room boundary.** The extension parses `xxx-yyyy-zzz` out of the Meet URL and appends it as `meeting_id`; the backend validates it against `MEETING_ID_PATTERN` in `main.py`. There is no auth beyond knowing the ID — anyone who can open a WebSocket with a given `meeting_id` gets that room's broadcasts.

**Backend request flow** (`backend/app/main.py`): first client message must be a `config` join handshake (`receive_join_payload`) before anything else is accepted. Each connection then runs two concurrent asyncio tasks sharing a `Queue` — `receive_loop` drains the socket, `process_loop` does STT + AI analysis — so a slow transcription/analysis call never blocks draining subsequent audio chunks. Audio bytes go through STT → analysis; JSON text messages (`config`, `summarize`, `transcript` for manual testing) are dispatched by `type`.

**Room state** (`backend/app/room_manager.py`) is in-process memory, keyed by `meeting_id`, holding: connections, per-connection display names (for speaker attribution), the single "chat sender" connection (only one client per room is ever told `send_to_chat: true`, to avoid duplicate chat posts — reassigned on disconnect), per-speaker chat cooldown timestamps, and both a pruned rolling `ConversationBuffer` (for contradiction analysis, windowed by `CONVERSATION_WINDOW_MINUTES`/`CONVERSATION_MAX_UTTERANCES`) and an unpruned `full_history` (for the whole-meeting Debug summarize feature — these two must stay separate). A background loop expires idle rooms after `ROOM_IDLE_TIMEOUT_MINUTES`. This class is explicitly the thing to swap for Redis pub/sub if the backend is ever horizontally scaled — see its docstring.

**AI provider abstraction** (`backend/app/ai_provider.py`): `AI_PROVIDER` (`openai` | `gemini`) selects the *analysis and summary* provider only. Speech-to-text is always OpenRouter's `openai/whisper-large-v3` (`backend/app/stt.py`) regardless of `AI_PROVIDER`, and always needs `OPENROUTER_API_KEY`. `create_ai_services` wires up `Transcriber` / `Detector` / `Summarizer` protocol implementations for whichever provider is configured; `Settings.ai_configured` gates whether the backend accepts WebSocket connections at all.

**Contradiction detection** (`backend/app/contradiction.py`): the system prompt instructs the model to take an actual stance (which option is better, why a plan is unworkable) rather than neutrally listing both sides, and to flag anything it judges worth raising rather than only strict pattern matches. Output is `reasons` (a short bullet list, not a single `explanation` string) plus `quote` (the exact transcript excerpt that triggered the judgment). `should_interject()` in `main.py` trusts the model's own `has_issue` boolean directly — `INTERJECTION_CONFIDENCE_THRESHOLD` is *not* a gate, it only surfaces in logs/UI for humans. When a speaker identity is known (a real display name, or an anonymous-audio pseudo-label from `diarization.py` — see below), the model is restricted to comparing that identity's own prior statements (never cross-speaker) for `contradiction`; with no identity at all it may flag meeting-level inconsistency but `target_speaker` must stay `null` — this normalization is enforced in code (`normalize_analysis`), not just prompted. A pseudo-label counts as "no identity" for everything user-facing: `is_pseudo_anonymous_speaker()` masks it back to `null` in `target_speaker` and to a generic "未知講者" in `format_utterance()`'s transcript rendering, so the model never even sees the raw label (and can't echo it into `suggested_interjection`) even though the label still drives same-speaker grouping at the code level. Separately, `suggested_interjection` itself must never name anyone — real display name included — since that text is also what gets posted verbatim into Meet chat; the floating card's own `target_speaker`/"對象：" field is the only place a real name shows up, and `format_interjection()` in `main.py` no longer splices a name into the message text. `RoomManager.register_issue_if_new` fuzzy-dedupes an about-to-broadcast issue against ones already reported this meeting (and `reported_issues_for_prompt` feeds that list back into the prompt) so an unresolved contradiction doesn't get re-flagged every analysis cycle — but a *new* issue of the same type (e.g. a fresh off-topic tangent) is not a duplicate and must still fire.

**Dual-track audio capture** (`extension/offscreen.js` + `background.js`): each extension instance opens two audio sources into the same room — the user's own mic (`getUserMedia`, named, primary) and Meet tab-mix audio (`chrome.tabCapture`, anonymous, fallback for participants without the extension; capture continues on mic alone if tab capture fails). This means a speaker who has the extension installed can get transcribed twice (once named via their own mic, once anonymously via someone else's tab-mix) — a known tradeoff documented in the README, not a bug to "fix" by deduplicating across rooms.

**Speaker attribution** flows one way: display name is attached at WebSocket join time (`RoomManager.join`) and used for every utterance on that connection; `content_script.js` tries to auto-detect the user's own name from the Meet DOM, with manual override in the popup. No display name on a connection → `main.py` tries anonymous speaker clustering next (see below) before falling back to fully unattributed "meeting-level" mode.

**Anonymous speaker clustering** (`backend/app/diarization.py`, optional — see `backend/requirements-diarization.txt`): a single anonymous audio source (tab-mix, or a shared mic with no display name set) can carry multiple people's speech blurred into one unattributed stream, which both loses per-person contradiction tracking and can misread "several different people's opinions" as "the meeting contradicting itself." For each already-VAD-cut utterance with no known display name, `extract_embedding()` (best-effort — returns `None` and never raises if resemblyzer/pydub/ffmpeg aren't installed or decoding fails) computes a voice embedding off the event loop via `asyncio.to_thread`; `RoomManager.match_anonymous_speaker` then clusters it by cosine similarity against that room's known anonymous voices (threshold `ANONYMOUS_SPEAKER_MATCH_THRESHOLD`, tuned high on purpose — see its comment for why low values merged different real people together on short opus-compressed clips), returning a stable pseudo-label ("匿名講者1", "匿名講者2", ...) instead of a real name. This runs per already-segmented utterance (turn-taking), not within one — it cannot split simultaneous/overlapping speech. The label is purely an internal grouping key: it's masked back out to "no identity" everywhere user-facing (see the Contradiction detection entry above) — only the code-level same-speaker grouping benefits from it, nothing visible ever shows "匿名講者N".

**Utterance segmentation is silence-based**, not fixed-interval: the extension sends a completed audio segment after ~0.9s of silence (with a 15s hard cap), not on a timer. Analysis triggers on *either* `ANALYSIS_INTERVAL_SECONDS` elapsing or `ANALYSIS_MIN_NEW_UTTERANCES` new utterances piling up (`RoomManager.add_utterance`), independent of how often transcripts arrive — the burst condition keeps fast exchanges from feeling sluggish without lowering the interval (and thus the API-call rate) for slow ones.

**Debug "整理重點" (summarize)** is a separate code path from interjection analysis: it summarizes `full_history` (whole meeting), always replies only to the requesting connection, and always sets `send_to_chat: true` on success/failure alike (bypassing the room's designated chat-sender mechanism) — the client only skips chat and shows a card when `send_to_chat` is absent (empty-history/error diagnostic replies omit it, per `handle_summarize`'s docstring).

## Key files

```
backend/app/main.py                WebSocket entry, join handshake, per-connection receive/process pipeline
backend/app/room_manager.py        Per-meeting_id room state, broadcast, chat-slot cooldown, idle cleanup
backend/app/conversation_buffer.py Rolling transcript window + dedupe
backend/app/contradiction.py       Structured interjection judgment (OpenAI + Gemini)
backend/app/summary.py             Whole-meeting Debug summary (OpenAI + Gemini)
backend/app/stt.py                 OpenRouter Whisper transcription
backend/app/diarization.py         Optional anonymous speaker voice-embedding extraction (see requirements-diarization.txt)
backend/app/ai_provider.py         Provider selection/wiring (AI_PROVIDER env var)
backend/app/config.py              Settings (pydantic-settings, reads .env)
extension/background.js            Service worker: capture lifecycle, offscreen doc, message routing to content script
extension/offscreen.js             Mic + tab-mix capture, WebSocket connection to backend, reconnection
extension/content_script.js        Floating UI, TTS, display-name detection, Meet chat auto-send
```

## Notes for changes

- `.env` holds real API keys and is gitignored; `.env.example` documents every setting — update both together when adding a config value, and mirror new settings into `backend/app/config.py`'s `Settings` model.
- WebSocket message contracts (`config`, `transcript`, `interjection`, `summarize`/`summary`, `join_ack`) are documented in detail in README.md — keep both in sync if you change the protocol.
- Tests live in `backend/tests/`; there is no extension test suite (manual testing via the popup's "測試浮動提醒＋語音" / "測試聊天室發送" buttons, per README's Demo/Debug sections).
- Setup walkthroughs live outside README now too — `docs/setup-{windows,macos,linux}.md`, `init.md`, `update.md`, `docs/deploy-cloudflare-tunnel.md` — and can drift out of sync with behavior changes (e.g. they don't yet mention the optional diarization install). Check them when a change affects first-run setup, not just README.
