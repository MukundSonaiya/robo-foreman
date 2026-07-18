# RoboForeman — 3-Minute Pitch Script (v2)

Companion to `RoboForeman-Pitch-3min-v2.pptx`.  
On-screen text is sparse; **this script carries the talk**. Total ≈ **2:55** including the fast-forward demo.

**Buffer tips**
- If the demo runs long → cut Slide 5’s last sentence.
- If rushing → **do not cut** the differentiation line on Slide 5 (judges are waiting for it).

---

## Slide 1 — Title (~12s)

> AI can build almost anything now. But it doesn't know *your* project.  
> Roboforeman fixes that — in two minutes. Let me show you.

---

## Slide 2 — The pain (~25s)

> This is Priya. She's got the smartest assistant in the world in her editor.  
> She says "add the payment screen" — and it writes code that ignores her project's style, calls commands that don't exist, and breaks something that worked.  
> Now she's fixing the AI instead of building. Every developer here has lived this.

---

## Slide 3 — The reframe (~28s)

> But the AI isn't dumb — it's *unbriefed*.  
> Drop a world-class builder on a site and tell them nothing, of course they guess wrong.  
> That's Roboforeman's job: it walks your codebase, sees what's missing, and hands the AI the site map, the rulebook, the safety tape, and how your team actually does things.  
> Watch it run.

---

## Slide 4 — Demo video (~45–50s)

*Narrate over the fast-forward video. Slide has a drop-in frame for the recording.*

> One command — `/scan` — it inspects the repo with an honest checklist. No vibes.  
> Second — `/build` — I tick what I want, hit *Lock it in*, and the crew works: rules, a project map, and skills learned from the repo's *own* code. Backed up first. Nothing overwritten.  
> Then `/contribute` — pick a good-first-issue, solve it to definition-of-done, ship a draft PR with **zero** foreman files in the diff.  
> Same request as before… and this time, the AI nails it.

---

## Slide 5 — Differentiation (~25s) — *do not cut*

> Now engineers are thinking — *I could just make those files myself.*  
> You could. Once. For one repo. If you remember every rule every time and never commit a secret.  
> Roboforeman does it instantly, the same way, on every project — and never forgets the safety tape.  
> On open-source, it won't even pollute your PR. That's automation — not a prompt you retype.

---

## Slide 6 — Under the hood (~25–30s)

> Under the cartoon it's a real, standard Cursor plugin.  
> The *decisions* are AI — it reads your code and, with Exa, your stack's live docs.  
> The *plumbing* is deterministic — tested detection, never overwrites your files, one-command undo, and triple protection so foreman files never land in an OSS PR.  
> We even gave the foreman a voice with ElevenLabs.  
> Judgment where you want AI; trust where you want safety.

---

## Slide 7 — Close (~12s)

> AI can build anything — it just needed to know your project. Now it does.  
> Point it at your repo or any open-source giant — scan, build, contribute.  
> Can we fix your repo? *Yes we can.* Thank you.

---

## Timing

| Slide | Beat | Time |
|-------|------|------|
| 1 | Title / hook | ~12s |
| 2 | The pain (Priya) | ~25s |
| 3 | Reframe + enter Roboforeman | ~28s |
| 4 | ▶ Demo (fast-forward) | ~45–50s |
| 5 | Differentiation | ~25s |
| 6 | Under the hood + sponsors | ~25–30s |
| 7 | Close | ~12s |
| | **Total** | **~2:55** |

## Design notes (v2 vs v1)

- **No purple** — charcoal + amber accent, light content slides.
- **Sparse copy** — storyline from team feedback; script in speaker notes.
- **Demo-first** — large video drop-in frame; flow is `/scan → /build → /contribute`.
- **OSS no-pollution** called out on Slides 4–6 (maintainers care).
