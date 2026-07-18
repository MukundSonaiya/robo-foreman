#!/usr/bin/env python3
"""Build RoboForeman 3-minute pitch deck v2 — minimal 16:9 PPTX."""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt
from lxml import etree

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
OUT = ROOT / "RoboForeman-Pitch-3min-v2.pptx"

# ── Minimal palette (no purple) ─────────────────────────────────────────────
INK = RGBColor(0x14, 0x14, 0x14)
MUTED = RGBColor(0x5C, 0x5C, 0x5C)
FAINT = RGBColor(0x9A, 0x9A, 0x9A)
RULE = RGBColor(0xE8, 0xE8, 0xE8)
BG = RGBColor(0xFF, 0xFF, 0xFF)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
AMBER = RGBColor(0xC2, 0x6A, 0x00)  # construction amber — not purple
AMBER_DEEP = RGBColor(0x9A, 0x54, 0x00)
CHAR = RGBColor(0x16, 0x16, 0x16)
SOFT = RGBColor(0xF2, 0xF2, 0xF2)  # cool gray panel, not cream
OK = RGBColor(0x2F, 0x6B, 0x3A)
BAD = RGBColor(0xA8, 0x3A, 0x2C)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

FONT_DISPLAY = "Helvetica Neue"
FONT_BODY = "Helvetica"


def set_run_font(run, size, bold=False, color=INK, font_name=FONT_BODY, italic=False):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = font_name
    rPr = run._r.get_or_add_rPr()
    for tag in ("latin", "ea", "cs"):
        el = rPr.find(qn(f"a:{tag}"))
        if el is None:
            el = etree.SubElement(rPr, qn(f"a:{tag}"))
        el.set("typeface", font_name)


def add_textbox(slide, left, top, width, height):
    return slide.shapes.add_textbox(left, top, width, height)


def write_para(tf, text, size, bold=False, color=INK, font_name=FONT_BODY,
               align=PP_ALIGN.LEFT, space_before=0, space_after=0, italic=False):
    p = tf.paragraphs[0] if not tf.paragraphs[0].text else tf.add_paragraph()
    if not tf.paragraphs[0].text and len(tf.paragraphs) == 1:
        p = tf.paragraphs[0]
    else:
        # first paragraph may already have content; ensure we use empty first once
        if tf.paragraphs[0].text == "" and len(tf.paragraphs) == 1:
            p = tf.paragraphs[0]
    p.clear()
    run = p.add_run()
    run.text = text
    set_run_font(run, size, bold=bold, color=color, font_name=font_name, italic=italic)
    p.alignment = align
    p.space_before = Pt(space_before)
    p.space_after = Pt(space_after)
    return p


def set_text(shape, lines, *, default_size=18, default_bold=False, default_color=INK,
             default_font=FONT_BODY, align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.TOP):
    """lines: list of str or dicts with text/size/bold/color/font/italic/space_before/space_after."""
    tf = shape.text_frame
    tf.clear()
    tf.word_wrap = True
    try:
        tf.auto_size = None
    except Exception:
        pass
    shape.text_frame.paragraphs[0].alignment = align

    # vertical anchor
    bodyPr = tf._txBody.find(qn("a:bodyPr"))
    if bodyPr is not None:
        anchor_map = {
            MSO_ANCHOR.TOP: "t",
            MSO_ANCHOR.MIDDLE: "ctr",
            MSO_ANCHOR.BOTTOM: "b",
        }
        bodyPr.set("anchor", anchor_map.get(valign, "t"))

    first = True
    for line in lines:
        if isinstance(line, str):
            line = {"text": line}
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = line.get("align", align)
        p.space_before = Pt(line.get("space_before", 0))
        p.space_after = Pt(line.get("space_after", 4))
        run = p.add_run()
        run.text = line["text"]
        set_run_font(
            run,
            line.get("size", default_size),
            bold=line.get("bold", default_bold),
            color=line.get("color", default_color),
            font_name=line.get("font", default_font),
            italic=line.get("italic", False),
        )


def add_rect(slide, left, top, width, height, fill=None, line=None, line_width_pt=1):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_width_pt)
    return shape


def add_round_rect(slide, left, top, width, height, fill=None, line=None, line_width_pt=1):
    """Plain rectangle (rounded-rect alias kept for call sites)."""
    return add_rect(slide, left, top, width, height, fill=fill, line=line, line_width_pt=line_width_pt)


def fill_slide_bg(slide, color=BG):
    add_rect(slide, 0, 0, SLIDE_W, SLIDE_H, fill=color)


def accent_bar(slide, left=Inches(0.7), top=Inches(0.55), width=Inches(0.55), height=Inches(0.08)):
    add_rect(slide, left, top, width, height, fill=AMBER)


def footer(slide, page, total=7):
    box = add_textbox(slide, Inches(0.7), Inches(7.05), Inches(8), Inches(0.3))
    set_text(
        box,
        [{"text": "roboforeman  ·  SmartSense  ·  Cursor Hackathon", "size": 11, "color": FAINT, "font": FONT_BODY}],
    )
    num = add_textbox(slide, Inches(11.8), Inches(7.05), Inches(1.0), Inches(0.3))
    set_text(
        num,
        [{"text": f"{page:02d} / {total:02d}", "size": 11, "color": FAINT, "align": PP_ALIGN.RIGHT}],
        align=PP_ALIGN.RIGHT,
    )


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text.strip()


# ── Slides ──────────────────────────────────────────────────────────────────

def slide_1_title(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide, CHAR)
    add_rect(slide, 0, 0, SLIDE_W, Inches(0.08), fill=AMBER)

    if (ASSETS / "hardhat-mark.png").exists():
        slide.shapes.add_picture(
            str(ASSETS / "hardhat-mark.png"),
            Inches(0.85), Inches(1.55),
            Inches(0.72), Inches(0.72),
        )

    eyebrow = add_textbox(slide, Inches(0.85), Inches(2.45), Inches(11), Inches(0.35))
    set_text(
        eyebrow,
        [{"text": "TEAM SMARTSENSE  ·  CURSOR HACKATHON", "size": 12, "bold": True, "color": AMBER, "font": FONT_BODY}],
    )

    title = add_textbox(slide, Inches(0.85), Inches(2.9), Inches(11.5), Inches(1.1))
    set_text(
        title,
        [{"text": "roboforeman", "size": 60, "bold": True, "color": WHITE, "font": FONT_DISPLAY}],
    )

    line = add_textbox(slide, Inches(0.85), Inches(4.15), Inches(11.2), Inches(1.3))
    set_text(
        line,
        [
            {
                "text": "From zero to your first open-source contribution\n— right inside Cursor.",
                "size": 24,
                "color": RGBColor(0xD0, 0xD0, 0xC8),
                "font": FONT_DISPLAY,
            }
        ],
    )

    sub = add_textbox(slide, Inches(0.85), Inches(5.7), Inches(11.2), Inches(0.7))
    set_text(
        sub,
        [
            {
                "text": "Cursor's AI builds. Roboforeman briefs it. Doesn't replace Cursor — directs Cursor's agent.",
                "size": 14,
                "color": FAINT,
                "font": FONT_BODY,
            }
        ],
    )

    notes(
        slide,
        """Everyone wants to contribute to open source. Almost nobody knows where to start.
Roboforeman takes you from zero to your first real contribution — without ever leaving Cursor.
Cursor's AI is the world-class builder. Roboforeman is the foreman who briefs it. Here's how.""",
    )


def slide_2_pain(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide)
    accent_bar(slide)

    label = add_textbox(slide, Inches(0.7), Inches(0.75), Inches(6), Inches(0.3))
    set_text(label, [{"text": "THE SAME DESIRE", "size": 12, "bold": True, "color": AMBER}])

    title = add_textbox(slide, Inches(0.7), Inches(1.1), Inches(11.8), Inches(0.7))
    set_text(
        title,
        [
            {
                "text": "Two people. Both supercharged by Cursor.",
                "size": 30,
                "bold": True,
                "color": INK,
                "font": FONT_DISPLAY,
            }
        ],
    )

    # two character columns
    chars = [
        ("Developer", "Ships features daily in Cursor.\nStill freezes on a stranger's repo."),
        ("Non-developer", "Cursor helps them build.\nStill lost in a huge stranger's repo."),
    ]
    for i, (head, body) in enumerate(chars):
        left = Inches(0.7) + i * Inches(6.2)
        add_rect(slide, left, Inches(2.05), Inches(5.85), Inches(2.15), fill=SOFT)
        add_rect(slide, left, Inches(2.05), Inches(0.08), Inches(2.15), fill=AMBER)
        h = add_textbox(slide, left + Inches(0.35), Inches(2.2), Inches(5.2), Inches(0.45))
        set_text(h, [{"text": head, "size": 22, "bold": True, "color": INK, "font": FONT_DISPLAY}])
        badge = add_textbox(slide, left + Inches(0.35), Inches(2.65), Inches(5.2), Inches(0.35))
        set_text(badge, [{"text": "Powered by Cursor", "size": 13, "bold": True, "color": AMBER}])
        b = add_textbox(slide, left + Inches(0.35), Inches(3.1), Inches(5.2), Inches(0.9))
        set_text(b, [{"text": body, "size": 15, "color": MUTED}])

    # shared emotional line
    shared = add_textbox(slide, Inches(0.7), Inches(4.45), Inches(11.9), Inches(0.45))
    set_text(
        shared,
        [
            {
                "text": "Both want to contribute. Neither knows where to start.",
                "size": 20,
                "bold": True,
                "italic": True,
                "color": INK,
                "font": FONT_DISPLAY,
            }
        ],
    )

    fears = [
        ("Where do I start?", "Hundreds of issues. No map."),
        ("What if I break their rules?", "Maintainers close the PR."),
        ("Huge, scary repo", "Thousands of files. Freeze."),
    ]
    for i, (head, body) in enumerate(fears):
        left = Inches(0.7) + i * Inches(4.15)
        add_rect(slide, left, Inches(5.1), Inches(0.08), Inches(1.35), fill=BAD)
        h = add_textbox(slide, left + Inches(0.25), Inches(5.1), Inches(3.7), Inches(0.4))
        set_text(h, [{"text": head, "size": 15, "bold": True, "color": INK, "font": FONT_DISPLAY}])
        b = add_textbox(slide, left + Inches(0.25), Inches(5.55), Inches(3.7), Inches(0.7))
        set_text(b, [{"text": body, "size": 14, "color": MUTED}])

    footer(slide, 2)
    notes(
        slide,
        """Meet two people — a developer and a non-developer. Both are supercharged by Cursor,
the most amazing AI IDE today. Cursor already makes them formidable.
But both of them — and almost everyone — want to contribute to open source.
And almost nobody knows where to start. Open a real repo and you freeze: Where do I even start?
What if I break their rules? Huge, scary codebase. That fear is the barrier — not their skill.""",
    )


def slide_3_enter(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide)
    accent_bar(slide)

    label = add_textbox(slide, Inches(0.7), Inches(0.75), Inches(6), Inches(0.3))
    set_text(label, [{"text": "ENTER ROBOFOREMAN", "size": 12, "bold": True, "color": AMBER}])

    title = add_textbox(slide, Inches(0.7), Inches(1.15), Inches(11.8), Inches(0.9))
    set_text(
        title,
        [
            {
                "text": "Roboforeman is your foreman — inside Cursor.",
                "size": 30,
                "bold": True,
                "color": INK,
                "font": FONT_DISPLAY,
            }
        ],
    )

    beats = [
        ("01", "You pick any open issue", "Any task already open in the repo — your choice."),
        ("02", "Learns the project's rulebook", "Contributing guide, conventions, how they ship."),
        ("03", "Briefs Cursor's AI to build it", "Cursor's agent implements the fix — their way."),
    ]
    for i, (num, head, body) in enumerate(beats):
        top = Inches(2.35) + i * Inches(1.05)
        n = add_textbox(slide, Inches(0.7), top, Inches(0.8), Inches(0.5))
        set_text(n, [{"text": num, "size": 22, "bold": True, "color": AMBER, "font": FONT_DISPLAY}])
        h = add_textbox(slide, Inches(1.7), top, Inches(10.5), Inches(0.45))
        set_text(h, [{"text": head, "size": 22, "bold": True, "color": INK, "font": FONT_DISPLAY}])
        b = add_textbox(slide, Inches(1.7), top + Inches(0.45), Inches(10.5), Inches(0.45))
        set_text(b, [{"text": body, "size": 16, "color": MUTED}])

    add_rect(slide, Inches(0.7), Inches(5.7), Inches(11.9), Inches(0.8), fill=CHAR)
    punch = add_textbox(slide, Inches(1.0), Inches(5.85), Inches(11.3), Inches(0.5))
    set_text(
        punch,
        [
            {
                "text": "You choose the work. Roboforeman + Cursor help you ship it.",
                "size": 18,
                "bold": True,
                "color": WHITE,
                "font": FONT_DISPLAY,
            }
        ],
        valign=MSO_ANCHOR.MIDDLE,
    )
    footer(slide, 3)
    notes(
        slide,
        """Roboforeman changes that. It's a Cursor plugin — it lives right in your editor.
You pick any open issue or task in the repo. Roboforeman doesn't find it for you —
you choose. Then it does the scary parts: reads the project's contributing guide and
conventions, and briefs Cursor's own AI to build the fix their way.
You're not alone in a giant repo anymore — you've got a foreman. Watch.""",
    )


def slide_4_demo(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide, CHAR)
    add_rect(slide, 0, 0, SLIDE_W, Inches(0.08), fill=AMBER)

    label = add_textbox(slide, Inches(0.7), Inches(0.35), Inches(10), Inches(0.3))
    set_text(
        label,
        [{"text": "DEMO  ·  INSIDE CURSOR  ·  6× FAST-FORWARD", "size": 12, "bold": True, "color": AMBER}],
    )

    title = add_textbox(slide, Inches(0.7), Inches(0.7), Inches(12), Inches(0.55))
    set_text(
        title,
        [
            {
                "text": "pick issue  →  brief  →  build  →  clean PR",
                "size": 26,
                "bold": True,
                "color": WHITE,
                "font": FONT_DISPLAY,
            }
        ],
    )

    frame_left, frame_top = Inches(0.7), Inches(1.45)
    frame_w, frame_h = Inches(8.6), Inches(5.25)
    add_round_rect(
        slide, frame_left, frame_top, frame_w, frame_h,
        fill=RGBColor(0x2A, 0x2A, 0x28), line=RGBColor(0x3A, 0x3A, 0x38),
    )

    if (ASSETS / "play-badge.png").exists():
        slide.shapes.add_picture(
            str(ASSETS / "play-badge.png"),
            Inches(4.35), Inches(3.35),
            Inches(1.1), Inches(1.1),
        )

    hint = add_textbox(slide, Inches(1.1), Inches(4.7), Inches(7.8), Inches(0.8))
    set_text(
        hint,
        [
            {
                "text": "Drop your Cursor demo video here\n(fallback stills: issue + draft PR)",
                "size": 14,
                "color": FAINT,
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    steps = [
        ("01  You pick", "Any open issue / task in the repo"),
        ("02  Brief", "Roboforeman learns their rulebook"),
        ("03  Build", "Cursor's agent implements the fix"),
        ("04  Clean PR", "Draft PR — no AI config in the diff"),
    ]
    y = Inches(1.45)
    for head, body in steps:
        add_rect(slide, Inches(9.6), y, Inches(0.08), Inches(1.05), fill=AMBER)
        h = add_textbox(slide, Inches(9.9), y, Inches(2.9), Inches(0.35))
        set_text(h, [{"text": head, "size": 13, "bold": True, "color": AMBER}])
        b = add_textbox(slide, Inches(9.9), y + Inches(0.35), Inches(2.9), Inches(0.6))
        set_text(b, [{"text": body, "size": 13, "color": RGBColor(0xC8, 0xC8, 0xC0)}])
        y += Inches(1.25)

    notes(
        slide,
        """Everything here is happening inside Cursor. I pick an open issue in the repo — my choice.
Roboforeman onboards: learns their setup, their commit style, their contributing rules.
Then Cursor's agent implements the fix to their definition of done — tests, minimal diff.
And it opens a clean draft pull request. Notice — none of my AI config leaked into the diff.
That's guaranteed. You choose the work; Roboforeman and Cursor help you ship it.""",
    )


def slide_5_diff(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide)
    accent_bar(slide)

    label = add_textbox(slide, Inches(0.7), Inches(0.75), Inches(8), Inches(0.3))
    set_text(label, [{"text": "WHY NOT JUST PROMPT CURSOR?", "size": 12, "bold": True, "color": AMBER}])

    title = add_textbox(slide, Inches(0.7), Inches(1.1), Inches(11.8), Inches(0.8))
    set_text(
        title,
        [
            {
                "text": '"Couldn\'t I just prompt this?"',
                "size": 32,
                "bold": True,
                "color": INK,
                "font": FONT_DISPLAY,
                "italic": True,
            }
        ],
    )

    hard = add_textbox(slide, Inches(0.7), Inches(2.0), Inches(11.9), Inches(0.55))
    set_text(
        hard,
        [
            {
                "text": "Matching their rules + a PR that passes review = the hard part.",
                "size": 18,
                "color": MUTED,
                "font": FONT_DISPLAY,
            }
        ],
    )

    # left: prompt trap
    add_rect(slide, Inches(0.7), Inches(2.75), Inches(5.7), Inches(2.85), fill=SOFT)
    left_t = add_textbox(slide, Inches(1.05), Inches(3.0), Inches(5.0), Inches(2.4))
    set_text(
        left_t,
        [
            {"text": "Prompting bits", "size": 20, "bold": True, "color": INK, "font": FONT_DISPLAY, "space_after": 12},
            {"text": "Sure — you can ask Cursor pieces.", "size": 16, "color": MUTED, "space_after": 8},
            {"text": "Remember every convention,", "size": 16, "color": MUTED, "space_after": 8},
            {"text": "every time — and never leak config.", "size": 16, "color": MUTED},
        ],
    )

    # right: foreman
    add_rect(slide, Inches(6.85), Inches(2.75), Inches(5.7), Inches(2.85), fill=CHAR)
    right_t = add_textbox(slide, Inches(7.2), Inches(3.0), Inches(5.0), Inches(2.4))
    set_text(
        right_t,
        [
            {"text": "One foreman, any site", "size": 20, "bold": True, "color": AMBER, "font": FONT_DISPLAY, "space_after": 12},
            {"text": "OSS contribution — their rules", "size": 16, "color": WHITE, "space_after": 8},
            {"text": "Your own repo — same briefing", "size": 16, "color": WHITE, "space_after": 8},
            {"text": "Always directing Cursor's agent", "size": 15, "color": FAINT},
        ],
    )

    bottom = add_textbox(slide, Inches(0.7), Inches(5.9), Inches(11.9), Inches(0.55))
    set_text(
        bottom,
        [
            {
                "text": "Same foreman also preps your own repo — so you build features faster inside Cursor.",
                "size": 16,
                "italic": True,
                "color": INK,
                "font": FONT_DISPLAY,
            }
        ],
    )

    footer(slide, 5)
    notes(
        slide,
        """Could you prompt Cursor to do bits of this? Sure. But matching a stranger's conventions
and shipping a PR that actually passes review — consistently — that's the hard part,
and that's the automation. You pick the issue; Roboforeman briefs Cursor's agent to solve it.
And the same foreman works on your own repo too: point it at your project and it briefs
Cursor's AI so you build features faster. One foreman, any site.""",
    )


def slide_6_hood(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide)
    accent_bar(slide)

    label = add_textbox(slide, Inches(0.7), Inches(0.75), Inches(6), Inches(0.3))
    set_text(label, [{"text": "UNDER THE HOOD", "size": 12, "bold": True, "color": AMBER}])

    title = add_textbox(slide, Inches(0.7), Inches(1.15), Inches(11.8), Inches(0.7))
    set_text(
        title,
        [
            {
                "text": "Fun on top. Real engineering underneath.",
                "size": 28,
                "bold": True,
                "color": INK,
                "font": FONT_DISPLAY,
            }
        ],
    )

    built = add_textbox(slide, Inches(0.7), Inches(1.95), Inches(11.9), Inches(0.4))
    set_text(
        built,
        [
            {
                "text": "Built ON Cursor:  skills  ·  agent  ·  hooks  ·  Canvas",
                "size": 18,
                "bold": True,
                "color": AMBER,
                "font": FONT_DISPLAY,
            }
        ],
    )

    pillars = [
        (
            "AI judgment",
            [
                "Cursor's agent reads code + CONTRIBUTING",
                "Exa → live stack docs, not stale guesses",
                "Briefs the builder — doesn't replace it",
            ],
        ),
        (
            "Deterministic trust",
            [
                "Never-clobber + one-command undo",
                "No AI-config pollution on OSS PRs",
                "Tested detection & merge plumbing",
            ],
        ),
    ]
    for i, (head, bullets) in enumerate(pillars):
        left = Inches(0.7) + i * Inches(6.2)
        add_rect(slide, left, Inches(2.55), Inches(0.08), Inches(2.5), fill=AMBER)
        h = add_textbox(slide, left + Inches(0.3), Inches(2.55), Inches(5.5), Inches(0.45))
        set_text(h, [{"text": head, "size": 20, "bold": True, "color": INK, "font": FONT_DISPLAY}])
        for j, b in enumerate(bullets):
            t = add_textbox(slide, left + Inches(0.3), Inches(3.15) + j * Inches(0.5), Inches(5.5), Inches(0.45))
            set_text(t, [{"text": b, "size": 15, "color": MUTED}])

    add_rect(slide, Inches(0.7), Inches(5.5), Inches(11.9), Inches(0.95), fill=SOFT)
    sp = add_textbox(slide, Inches(1.0), Inches(5.65), Inches(11.3), Inches(0.65))
    set_text(
        sp,
        [
            {
                "text": "Exa  ·  ElevenLabs (the foreman speaks)  ·  Render",
                "size": 16,
                "bold": True,
                "color": INK,
            }
        ],
        valign=MSO_ANCHOR.MIDDLE,
    )

    footer(slide, 6)
    notes(
        slide,
        """Under the cartoon, it's a real, standard Cursor plugin — built on Cursor's own skills,
agent, hooks, and Canvas. The decisions are AI, reading the project's live docs with Exa;
the plumbing is deterministic and never-destructive. We even gave the foreman a voice
with ElevenLabs. Cursor does the building — Roboforeman makes sure it builds the right thing.""",
    )


def slide_7_close(prs):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    fill_slide_bg(slide, CHAR)
    add_rect(slide, 0, 0, SLIDE_W, Inches(0.08), fill=AMBER)

    if (ASSETS / "hardhat-mark.png").exists():
        slide.shapes.add_picture(
            str(ASSETS / "hardhat-mark.png"),
            Inches(6.25), Inches(1.2),
            Inches(0.85), Inches(0.85),
        )

    title = add_textbox(slide, Inches(0.8), Inches(2.3), Inches(11.7), Inches(1.3))
    set_text(
        title,
        [
            {
                "text": "Your first open-source PR\nis one command away.",
                "size": 34,
                "bold": True,
                "color": WHITE,
                "font": FONT_DISPLAY,
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    catch = add_textbox(slide, Inches(0.8), Inches(3.9), Inches(11.7), Inches(0.55))
    set_text(
        catch,
        [
            {
                "text": "Can we fix your repo? Yes we can.",
                "size": 22,
                "bold": True,
                "color": AMBER,
                "font": FONT_DISPLAY,
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    sub = add_textbox(slide, Inches(1.2), Inches(4.7), Inches(10.9), Inches(0.7))
    set_text(
        sub,
        [
            {
                "text": "You pick the issue. Roboforeman briefs Cursor's agent.\nEverything happens inside Cursor.",
                "size": 16,
                "color": RGBColor(0xC8, 0xC8, 0xC0),
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    brand = add_textbox(slide, Inches(0.8), Inches(5.7), Inches(11.7), Inches(0.4))
    set_text(
        brand,
        [
            {
                "text": "roboforeman",
                "size": 18,
                "bold": True,
                "color": AMBER,
                "font": FONT_DISPLAY,
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    thanks = add_textbox(slide, Inches(0.8), Inches(6.25), Inches(11.7), Inches(0.35))
    set_text(
        thanks,
        [
            {
                "text": "SmartSense  ·  Built on Cursor  ·  Thank you",
                "size": 13,
                "color": FAINT,
                "align": PP_ALIGN.CENTER,
            }
        ],
        align=PP_ALIGN.CENTER,
    )

    notes(
        slide,
        """Open source shouldn't be scary. With Roboforeman and Cursor, your first contribution
is one command away. You pick any open issue — Roboforeman briefs Cursor's agent to solve it.
Can we fix it? Yes we can. Thank you.""",
    )


def fix_widescreen_sldsz(prs):
    """python-pptx leaves type='screen4x3' even after resizing — fix to match 16:9."""
    sldSz = prs.part._element.find(
        "{http://schemas.openxmlformats.org/presentationml/2006/main}sldSz"
    )
    if sldSz is not None:
        sldSz.set("cx", str(int(SLIDE_W)))
        sldSz.set("cy", str(int(SLIDE_H)))
        sldSz.set("type", "screen16x9")


def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    fix_widescreen_sldsz(prs)

    slide_1_title(prs)
    slide_2_pain(prs)
    slide_3_enter(prs)
    slide_4_demo(prs)
    slide_5_diff(prs)
    slide_6_hood(prs)
    slide_7_close(prs)

    prs.save(OUT)
    print(f"Wrote {OUT} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    main()
