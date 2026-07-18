# RoboForeman — Pitch Deck v2

3-minute hackathon pitch for **AI for Everyday Experiences** (Team SmartSense).

| File | Purpose |
|------|---------|
| `RoboForeman-Pitch-3min-v2.keynote.pptx` | **Open this on Mac → Keynote** (same deck, clearer name) |
| `RoboForeman-Pitch-3min-v2.pptx` | Same presentation (widescreen 16:9) |
| `RoboForeman-Pitch-3min-v2.keynote.pdf` | Optional Preview-friendly export |
| `OPEN-IN-KEYNOTE.md` | Mac steps to save a native `.key` |
| `SPEAKER-SCRIPT-3min.md` | Spoken script + timing |
| `build_pitch_v2.py` | Regenerator (edit → rerun) |
| `assets/` | Hard-hat mark + demo placeholder |

## Mac / Keynote (easiest)

1. Download `RoboForeman-Pitch-3min-v2.keynote.pptx`
2. Open with **Keynote**
3. **File → Save** → native `.key` for presenting / sharing

Details: [OPEN-IN-KEYNOTE.md](./OPEN-IN-KEYNOTE.md)

## What changed from v1

1. **Storyline rewrite** — Priya pain → “unbriefed AI” reframe → demo → skeptic answer → under the hood → close.
2. **Minimal palette** — removed purple/violet; charcoal + amber accent.
3. **Demo-ready** — large video drop-in frame; flow is `/scan → /build → /contribute`.
4. **Speaker notes** embedded on every slide (same as the script file).
5. **Keynote-friendly** — Helvetica Neue / Helvetica, simple shapes.

## Before you present

1. Open in Keynote and **replace the demo placeholder** (Slide 4) with your fast-forward video.
2. Rehearse with `SPEAKER-SCRIPT-3min.md` once against a timer.
3. If demo overruns: cut the last sentence of Slide 5 — **never** cut the differentiation beat.

## Regenerate

```bash
python3 pitch/build_pitch_v2.py
```
