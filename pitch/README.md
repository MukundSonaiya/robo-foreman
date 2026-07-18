# RoboForeman — Pitch Deck v2

3-minute hackathon pitch for **AI for Everyday Experiences** (Team SmartSense).

## Open on Mac

| File | Use |
|------|-----|
| **`RoboForeman-Pitch-Keynote.pptx`** | Open with **Keynote** (recommended) |
| **`RoboForeman-Pitch-Keynote.pdf`** | Open with **Preview** if PPTX fails |
| `OPEN-IN-KEYNOTE.md` | Step-by-step + troubleshooting |

1. Download `RoboForeman-Pitch-Keynote.pptx`
2. Right-click → **Open With → Keynote**
3. **File → Save** → native `.key`

## Other files

| File | Purpose |
|------|---------|
| `RoboForeman-Pitch-3min-v2.pptx` | Source build (pre-sanitize) |
| `SPEAKER-SCRIPT-3min.md` | Spoken script + timing |
| `build_pitch_v2.py` | Regenerator |
| `assets/` | Icons / demo placeholder |

## Story arc

1. Hook — AI doesn’t know *your* project  
2. Pain — Priya  
3. Reframe — unbriefed AI  
4. Demo — `/scan → /build → /contribute`  
5. Differentiation  
6. Under the hood + sponsors  
7. Close  

## Regenerate

```bash
python3 pitch/build_pitch_v2.py
# requires LibreOffice (`soffice`) for the Keynote-safe export
```
