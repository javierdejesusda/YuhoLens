# YuhoLens-Pipeline Demo Video Script

## Live walkthrough script (5 min, judging-day talk track)

This walkthrough is the speaking script for the live demo at the AMD
Developer Hackathon judging session. It is independent of the 90-second
submission video below; the video is for asynchronous viewing on the
lablab.ai page, the walkthrough is for the room. Target runtime is five
minutes end-to-end on a single laptop screen-share, with a stopwatch
visible to the speaker. The five minutes are budgeted as 30s setup +
60s ingest + 90s 4-agent composer with best-of-5 + 60s judge picks +
60s final memo + Q&A buffer.

### Beat 0 — Setup (00:00–00:30)

Open with the `yuholens/yuholens-14b` HuggingFace page (or the staging
preview if not public yet) on the left half of the screen and a
terminal pinned to `C:\Projects\AMD-hackaton` on the right. State the
single thesis line: "We take a Japanese annual report and produce an
English investor memo that cites every material claim back to the
Japanese source span — or refuses to make the claim." Mention the
KG-2 PASS up front so the judges have the headline before any code
runs: coherence 3.88, citation rate 1.000, section coverage 0.994.

### Beat 1 — Load the Yuho (00:30–01:30)

Pick one row from `data/eval/kg2_test.jsonl` — pick something with a
real going-concern note so the audience can see the cross-section
machinery do work. Show the source PDF or the extracted text in a
secondary window for two seconds, then run the ingestor:

```bash
PYTHONPATH=src python -m yuholens.ingestor --row data/eval/kg2_test.jsonl:0
```

Narrate while it runs. The ingestor is regex-driven, runs in under a
second, and produces the labelled section dict that downstream nodes
consume. Point out that the section labels are Japanese — the model is
the only thing in the pipeline that needs to read Japanese; the
ingestor and grounder are language-blind. Show the resulting section
keys in the terminal (`事業等のリスク`, `経営者による財政状態...`, etc.).

### Beat 2 — 4-agent composer with best-of-5 (01:30–03:00)

Switch to a Python REPL or a notebook cell that constructs the
LangGraph application with `best_of_n=True`:

```python
from yuholens.agents.graph import build_pipeline

app = build_pipeline(
    best_of_n=True,           # enables MemoCriticAgent
    n_candidates=5,           # five decoder profiles
    judge_mode="judge",       # gpt-5-mini coherence judge
)
result = app.invoke(state)
```

While it runs, talk through the four nodes. The Ingestor is already
done. Pass-1 fans out one call per Japanese section and emits structured
JSON with red flags and Japanese-span citations. The MemoCriticAgent
fans out **five** Pass-2 calls, each at a different decoder profile
from `src/yuholens/agents/decoder_profiles.py` — two perturbed-decoder
variants and three v5-profile fixed-decoder seeds. The citation
grounder cleans every memo claim that lacks a Japanese-span backing.

Point out the design decision: the SFT checkpoint single-shot scored
3.56 mean coherence, which is SOFT. Decoder diversity at inference
time lifted the same checkpoint to 3.88 PASS without any extra
training. The critic is the cheapest gate-clear move available.

### Beat 3 — Judge picks the best (03:00–04:00)

When the composer finishes, dump `result["candidate_scores"]` and
`result["picked_profile"]` to the terminal. Narrate that this is the
gpt-5-mini judge running once per candidate at the
`DEFAULT_RUBRIC` from `src/yuholens/eval/metrics.py`. Walk the
audience through the score vector — point out the two perturbed
profiles tend to win on prompts with strong cross-section tension,
the v5 seeds tend to win on prompts that are already directionally
consistent. This is the cross-decoder vs cross-seed finding from
the 2026-04-25 session.

If `OPENAI_API_KEY` is not exported on the demo laptop, fall back
to `judge_mode="heuristic"` and explain that the heuristic uses
citation count + section coverage + a length window — it's the
no-API stand-in for offline demos and has Spearman ~0.6 against
the judge on the KG-2 fresh-pass sample.

### Beat 4 — Final memo (04:00–05:00)

Print `result["grounded_memo"]` and scroll through the seven sections.
Highlight one inline citation in the executive summary
(`(ref: '...' p.12)`) and one `[evidence insufficient]` placeholder
if the run produced any. Land on the abstention-as-feature line: a
sentence with no grounded citation gets refused, not silently
dropped. Close with the spend line — the entire pipeline reproduces
in 23 days inside the $80 AMD Developer Cloud envelope, and the
KG-2 PASS came from inference-time best-of-N over the existing SFT
checkpoint, not a second training run.

End the demo with the three URLs already on the end card of the
submission video (GitHub, HuggingFace, lablab.ai) and a one-line
ask: "happy to take questions on the MI300X training, the
LangGraph 4-agent design, or the best-of-N picker."

### Backup if anything fails live

If the live run wedges, switch to the cached output committed in
`data/eval/kg2_memos_bo5_picked.jsonl` and read one memo from disk.
The five-minute budget still works because Beat 2 collapses to a
30-second narration over a static `cat` of the JSONL row. Practice
this fallback at least once before the day of judging — every
hackathon demo eventually hits a network or API hiccup, and the
talk track has to keep moving.

## Front-matter

- **Title:** YuhoLens-Pipeline — 90-second submission demo
- **Runtime target:** 90 seconds (hard cap 95 seconds)
- **Aspect ratio:** 1920 x 1080, 30 fps, MP4 / H.264
- **Audio:** 48 kHz stereo, -14 LUFS integrated loudness, -1.0 dBTP peak
- **Recording tool (screen):** OBS Studio (free) is the primary recommendation. Loom, ScreenPal, or Camtasia are acceptable substitutes
- **Recording tool (voice):** Audacity or the OBS built-in audio track with a USB condenser mic (Blue Yeti, Shure MV7, or Rode NT-USB class)
- **Voice talent:** User records themselves. Record English, mid-pace, even tone. No accent coaching needed
- **Editing tool:** DaVinci Resolve (free) or CapCut Desktop for cuts plus caption burn-in
- **Delivery format:** Single MP4 upload to lablab.ai submission form plus an unlisted YouTube fallback
- **Submission deadline:** 2026-05-09 on lablab.ai
- **Hackathon track:** AMD Developer Hackathon (open-weight fine-tune with AMD Radeon eligibility narrative)

## Pre-flight asset list

Collect or record these before the first take. Everything here is either a
screen recording, a still slide, or a licensed image. If an asset is `TBD`
flag it for the user to capture once the training run finishes.

### Screen recordings (record these clean, no cursor jitter, 1920 x 1080)

1. **Ingestor terminal run.** Terminal window (Windows Terminal, dark theme,
   Cascadia Mono 14 pt) running `python -m yuholens.ingest path/to/yuho.pdf`.
   The output must show the 16 section labels being printed in order
   (`事業等のリスク`, `経営者による財政状態...`, etc.). 15 seconds of clean
   runtime is enough — you will trim to roughly 6 seconds.

2. **LangGraph trace view.** LangSmith trace UI or the LangGraph dev UI
   showing the 4-node DAG: Ingestor → Pass-1 → Pass-2 → Citation-Grounder.
   Zoom to fit. Record 10 seconds. If LangSmith is not connected, a static
   Mermaid render of the DAG is an acceptable fallback.

3. **HuggingFace repo page.** The `yuholens/yuholens-14b` model card at the
   top of the page, scrolled to show title, tags, and the first paragraph of
   the README. 5 seconds. If the repo is still private on recording day, use
   a staging screenshot and mark it "preview" in on-screen text.

4. **Side-by-side Yuho excerpt + English memo.** A 1920 x 1080 still (not a
   recording) with the original Japanese Yuho excerpt on the left (highlight
   one sentence in yellow — e.g. `売上高は前年同期比42%減少`) and the English
   memo paragraph on the right with an inline citation `(ref: '売上高は前年
   同期比42%減少' p.12)` in a monospace font. The citation string is the
   visual payload of the whole video — make sure the citation is legible
   when the viewer watches on a phone.

5. **Training-loss TensorBoard screenshot.** `TBD`. The final SFT loss curve
   alone (the ORPO route never produced a shipped checkpoint; do not show
   an ORPO reward margin curve). Exact numbers are `TBD` until the SFT
   run is re-screenshotted. Do not invent Y-axis values.

6. **llama.cpp inference clip.** Pre-recorded `./llama-cli -m
   yuholens-14b-Q4_K_M.gguf -p "<sample prompt>"` streaming English memo
   tokens. Tok/s counter visible at the bottom. 8 seconds. The exact tok/s
   number on this clip is `TBD` — capture this after the GGUF is quantised
   and benchmarked on the 4060 Ti. Do not claim a number in voiceover until
   this clip confirms it.

### Static images and slides

7. **Title card (00:00–00:02 overlay).** Slide with the text
   `YuhoLens: span-cited English memos from Japanese Yuho`. Dark background,
   single-weight sans-serif (Inter or IBM Plex Sans). No logo lockups yet.

8. **Dataset stat slide.** Three numbers stacked: `865 fraud`,
   `549 earnings forecasts`, `496 industry predictions` — total
   `1,910 Yuho` from `SakanaAI/EDINET-Bench`.

9. **MI300X product image.** From the AMD press kit at
   `amd.com/en/newsroom/image-gallery`. Attribution required in the end
   card: `MI300X image courtesy AMD`. Do not use third-party renders. If the
   official press-kit asset has restrictive terms, fall back to a
   three-quarter AMD Instinct MI300 product render you licensed elsewhere
   and update the attribution line.

10. **Cost and budget slide.** `23 days, under $80` — single line, large
    type. Back it up with the math in the video description, not on-screen.

11. **End card (URL trio).** Three URLs stacked:
    `github.com/javierdejesusda/YuhoLens`,
    `huggingface.co/yuholens`,
    `lablab.ai/event/amd-developer-hackathon`.
    Also on-screen: `@AMDdeveloper` and `@lablabai` tag handles.

### Animations (optional — keep to 2 max, each under 3 seconds)

12. **Ingestor section split animation.** A single Yuho PDF page fans out
    into 16 labelled cards. Keep this under 2.5 seconds. After Effects or
    Figma Smart Animate. If the animation eats budget, drop it and use the
    static terminal recording.

13. **Citation-Grounder "strike-through" animation.** A line of English
    text with no citation gets a red strike-through, then replaced by
    `(refused — no grounded citation)`. 1.5 seconds. This is the single
    most distinctive visual — do not cut this one.

### Audio

14. **Voiceover master.** Single-take read of the full 90-second script,
    then a second clean take for safety. Record both — splice sentences
    from whichever take reads cleaner.

15. **Music bed.** Royalty-free minimal synth from YouTube Audio Library,
    Epidemic Sound, or Uppbeat. Target mood: "low synth pad, forward
    motion, no drums in the first 15 seconds." Mixed low — voiceover
    sits about 14 dB above the music bed.

## Scene-by-scene storyboard

Six scenes, total 90 seconds. Word counts assume roughly 2.5 spoken words
per second — about 25 words per 10 seconds. The scripts below are already
within that envelope; if a line feels rushed on the read-through, shave
adjectives, not facts.

### Scene 1 — Hook (00:00–00:10)

- **Duration:** 10 seconds
- **Visual:** Cut straight to the side-by-side still (asset #4): Japanese
  Yuho excerpt on the left, English memo with inline citation on the right.
  Title-card text (asset #7) slides in across the bottom third at 00:02 and
  stays until 00:08.
- **On-screen text overlay:** Line 1 `Japanese Yuho → English memo`.
  Line 2 `Span-cited. Abstention-first.`
- **Voiceover (25 words):**

  > Japanese annual reports hide multi-year red flags that no current
  > English-language LLM can catch across sections. YuhoLens reads the
  > Yuho, and cites every claim.

### Scene 2 — Problem and dataset (00:10–00:25)

- **Duration:** 15 seconds
- **Visual:** Cross-fade from the hook into the dataset stat slide (asset
  #8) for 6 seconds, then cut to the ingestor terminal clip (asset #1)
  for the remaining 9 seconds. While the terminal plays, overlay the
  citation format `(ref: '<span>' p.N)` in the lower-right corner.
- **On-screen text overlay:** First half `1,910 Yuho · EDINET-Bench`.
  Second half `Cite the Japanese span or refuse`.
- **Voiceover (37 words):**

  > EDINET-Bench gives us 1,910 source Yuho: 865 fraud cases, 549
  > earnings-forecast filings, 496 industry-prediction disclosures. The
  > rule is simple. Every sentence in the English memo has to cite a
  > Japanese span, or it gets refused.

### Scene 3 — Training on MI300X (00:25–00:45)

- **Duration:** 20 seconds
- **Visual:** Cut to the MI300X product image (asset #9) centred for 7
  seconds with a slow Ken Burns push-in. Cross-fade at 00:32 to the
  training-loss TensorBoard screenshot (asset #5) held for 13 seconds.
  Keep the overlay minimal — the curve is the payload.
- **On-screen text overlay:** First half `AMD Instinct MI300X · 192 GB
  HBM`. Second half `Seq 8192 · 8-bit AdamW · ROCm flash-attn`.
- **Voiceover (50 words):**

  > Base model: a fourteen-billion-parameter Qwen 1, pretrained for
  > Japanese finance by Preferred Networks. We fine-tuned it on a single
  > AMD Instinct MI300X. One hundred ninety-two gigabytes of HBM.
  > Sequence eight-thousand-one-ninety-two, bitsandbytes eight-bit
  > AdamW, ROCm flash-attention, two epochs. Final loss — TBD.

### Scene 4 — The 4-agent LangGraph (00:45–01:05)

- **Duration:** 20 seconds
- **Visual:** Start on the LangGraph trace view (asset #2) for 8 seconds.
  At 00:53 cut to the Citation-Grounder strike-through animation (asset
  #13) for 2 seconds. At 00:55 return to the trace view, zoomed into the
  final node, for 10 seconds. If budget is tight and you cannot record
  the trace, use the Mermaid fallback and pan left-to-right across the
  four nodes so the audience sees them in reading order.
- **On-screen text overlay:** First half `Ingestor → Pass-1 → Pass-2 →
  Citation-Grounder`. Second half `No span. No claim.`
- **Voiceover (49 words):**

  > Four agents. The Ingestor splits the Yuho into sixteen labelled
  > Japanese sections. Pass-one detects red flags per section as
  > structured JSON. Pass-two composes the English memo. The
  > Citation-Grounder refuses every claim that lacks a Japanese-span
  > citation. No span, no claim — it is that simple.

### Scene 5 — Consumer release (01:05–01:20)

- **Duration:** 15 seconds
- **Visual:** Cut to the llama.cpp inference clip (asset #6) for the full
  15 seconds. Tok/s counter stays on-screen the whole time. Overlay the
  `9.45 GB · Q4_K_M` tag in the upper-right corner.
- **On-screen text overlay:** First half `Q4_K_M · 9.45 GB · RTX 4060 Ti`.
  Second half `23 days · under $80`.
- **Voiceover (38 words):**

  > The release is a Q4-K-M GGUF, nine-point-four-five gigabytes, sized
  > for a single RTX four-thousand-sixty Ti. Target throughput — eighteen
  > tokens per second or better. Exact number — TBD on the recording
  > rig. Full pipeline reproducible in twenty-three days, under eighty
  > dollars.

### Scene 6 — Close (01:20–01:30)

- **Duration:** 10 seconds
- **Visual:** Cut to the end-card slide (asset #11). Hold for the full
  10 seconds. Fade music bed at 01:28 and end on silence at 01:30.
- **On-screen text overlay:** `github.com/javierdejesusda/YuhoLens` ·
  `huggingface.co/yuholens` · `lablab.ai` — stacked. Handles
  `@AMDdeveloper` and `@lablabai` in smaller type under the URL trio.
- **Voiceover (23 words):**

  > YuhoLens. Trained on AMD MI300X. Open-sourced today. GitHub,
  > HuggingFace, lablab — all live. Thanks to AMD and to the
  > lablab team.

## Post-production notes

- **Caption burn-in.** Burn hard subtitles into the video master. Most
  hackathon judges skim on mobile with sound off — if the video is not
  legible muted, it does not score. Use a single sans-serif caption
  font (Inter Medium, 48 pt, white with a 2 px black stroke) pinned to
  the lower third. Keep lines to 42 characters maximum. Caption one
  sentence at a time, never two.

- **Accessibility.** Ship two artefacts to the submission page: the MP4
  with burned-in captions, plus a separate `.srt` sidecar file. The SRT
  lets screen readers and hearing-aid relay pick up the script. Name
  the SRT the same stem as the MP4 so YouTube picks it up
  automatically. Also add alt text on any thumbnail or social share
  image.

- **Music.** Royalty-free minimal synth, mixed approximately -28 LUFS
  (about 14 dB below the voiceover). Duck the music by another 3 dB
  during Scene 3 and Scene 4 — the training and architecture beats are
  the densest information density in the video and need every dB of
  voice clarity. Fade out over the final 2 seconds of Scene 6. Do not
  bed-music the end card silence.

- **Colour grade.** Neutral dark. No teal-and-orange. The video should
  look like a lab notebook, not a Super Bowl spot. Match the HuggingFace
  dark theme so the screen-recording cuts do not flash.

- **End card.** Three URLs stacked, centred, held for the full closing
  10 seconds. Include a small `MI300X image courtesy AMD` attribution
  line in 12 pt type at the bottom margin. This is a required credit for
  AMD press-kit use.

- **Exports.** Master export at 1920 x 1080, 30 fps, H.264, 10 Mbit/s
  target bitrate, 12 Mbit/s max. Also export a 1080 x 1920 vertical
  crop focused on the citation still (asset #4) — that crop is the
  single best social share for X and LinkedIn.

- **File naming.** Master file: `yuholens-demo-90s-v1.mp4`. Increment
  the version suffix every new export — never overwrite a previous
  master, because the lablab moderators may ask you to re-upload.

## Cut list (if the edit runs long)

If your first assembly comes in at 95–100 seconds, cut in this order.
The top of this list goes first; the abstention / citation claim is
the last thing you ever cut. Keep the Citation-Grounder beat even if
everything else has to be trimmed to the bone.

1. **Cut the ingestor terminal b-roll tail.** Trim Scene 2 from 15
   seconds to 12 seconds by ending on the citation-format overlay
   instead of the last three seconds of scrolling terminal. Saves 3s.
2. **Tighten the MI300X Ken Burns.** In Scene 3, shorten the product-
   image hold from 7 seconds to 4 seconds. The curve is the payload,
   not the render. Saves 3s.
3. **Drop the "MI300X image courtesy AMD" spoken credit.** Keep the
   credit on-screen in the end card, but do not read it in voiceover.
   Saves 2s.
4. **Compress Scene 5's dollar beat.** Cut the words "under eighty
   dollars" from the Scene 5 voiceover — leave it on the overlay only.
   Saves 2s.
5. **Tighten the hook.** In Scene 1, cut "across sections" — the
   still frame already conveys the cross-section idea. Saves 1s.
6. **Last resort — drop Scene 3's section-split animation.** If you
   included asset #12, pull it. The terminal recording carries the
   same message. Saves up to 2.5s.

Do not cut:
- The span-level citation still (Scene 1, asset #4).
- The Citation-Grounder strike-through animation (Scene 4, asset #13).
- The abstention-as-feature line ("No span, no claim" in Scene 4 or
  "gets refused" in Scene 2). At least one of these two lines must
  survive to the final cut.

## Recording checklist

Run through this once the script is locked. Do each step in order; do
not skip the practice take.

1. **Script read-through, take one.** Read the entire voiceover script
   out loud, at target pace, with a stopwatch. Target 88–92 seconds
   total. Mark every word you stumble on — those are edit candidates.
2. **Script read-through, take two.** Re-read with the edits. Confirm
   you land inside the 88–92 window on this read. If you are still
   over 92 seconds, cut from the cut list above before recording.
3. **Camera or screen test.** Record a 15-second test with every source
   (screen capture, webcam if used, slide deck) to confirm
   1920 x 1080, 30 fps, and that the captured fonts are legible at
   100% zoom on a 1080p mobile screen preview.
4. **Mic test.** Record 10 seconds of voiceover at the exact mic
   position you will use for the real take. Check peak loudness
   (should not clip), check background hiss (should be silent during
   breath pauses), check room reflections (if you hear the room,
   move closer to the mic or add a blanket behind you).
5. **Practice take at full runtime.** Record one full 90-second pass
   end-to-end, voiceover plus the screen cues, without stopping.
   Watch it back muted, then watch it back with sound. Note every
   rough edit point before the real take.
6. **Real takes.** Record the voiceover twice (two full passes,
   front-to-back). Record each screen recording twice. You now have
   an A take and a B take for every asset — edit from whichever is
   cleaner per beat.
7. **Final QA.** Watch the assembled cut three times: once at 100%
   volume on laptop speakers, once with good headphones, once muted
   with only the burned-in captions. If the muted watch is not fully
   intelligible, re-cut the captions before exporting.
8. **Export and archive.** Export the master, archive the project
   file, the raw voiceover, and every screen recording to a dated
   folder. The lablab submission form sometimes needs a re-upload;
   keep the project recoverable for at least 30 days after the
   deadline.

## Appendix — Word count and pacing table

Target is approximately 2.5 spoken words per second. Word counts below
are the written word counts of the voiceover in each scene. Adjust the
voiceover read rate, not the word count, if a scene feels rushed.

| Scene | Time window   | Duration | Voiceover words | Words/sec |
| ----- | ------------- | -------- | --------------- | --------- |
| 1     | 00:00–00:10   | 10 s     | 25              | 2.5       |
| 2     | 00:10–00:25   | 15 s     | 37              | 2.47      |
| 3     | 00:25–00:45   | 20 s     | 50              | 2.5       |
| 4     | 00:45–01:05   | 20 s     | 49              | 2.45      |
| 5     | 01:05–01:20   | 15 s     | 38              | 2.53      |
| 6     | 01:20–01:30   | 10 s     | 23              | 2.3       |
| Total | 00:00–01:30   | 90 s     | 222             | 2.47      |

All numbers that depend on the actual training or inference rigs
(final SFT loss, measured tok/s on the 4060 Ti, measured eval metrics
such as citation faithfulness and coherence) are written as `TBD`
above. Do not fill them in until you have the measurement captured in
a screen recording that will ship in the video. ORPO did not produce a
shipped checkpoint, so do not reference an ORPO reward margin in the
narration or on screen.
