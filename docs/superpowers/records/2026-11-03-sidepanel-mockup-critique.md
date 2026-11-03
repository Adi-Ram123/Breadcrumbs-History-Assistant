<!-- Copied from .impeccable/critique/ (git-ignored scratch). It reviewed the brainstorm mockup now saved as docs/superpowers/specs/sidepanel-mockups/; the paths in the front matter point at the original scratch file. -->

---
target: side panel chat UI mockups
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/daniel/Downloads/Breadcrumbs-History-Assistant/.superpowers/brainstorm/7521-1793681354/content/answer-card-ledger.html"
target_fingerprint: "sha256:9fdd4c2c24fb20f1c8d689f5c62bdd1ecc89d4ba83344a16442c34215774ddf4"
target_path: /Users/daniel/Downloads/Breadcrumbs-History-Assistant/.superpowers/brainstorm/7521-1793681354/content/answer-card-ledger.html
timestamp: 2026-11-03T06-09-21Z
slug: 793681354-content-answer-card-ledger-html-d4b86a9d
---
# Critique: side panel chat mockups (A1, A2, first open, waiting, offline)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Static waiting line; rows hidden though fetched in ~11 ms |
| 2 | Match System / Real World | 2 | Jargon by default: "LLM · 1.2 s", "Template", "Kind visit", "localhost:8000" |
| 3 | User Control and Freedom | 2 | No Stop; "+" wipes thread with no undo; misread date needs retyping |
| 4 | Consistency and Standards | 3 | LLM text vs Template pill; "Visits" vs "visit"; chips read 3,2,1 |
| 5 | Error Prevention | 2 | New chat has no undo; Send live while offline |
| 6 | Recognition Rather Than Recall | 3 | Open-page icon only on hover |
| 7 | Flexibility and Efficiency | 1 | No keyboard hints, open-all-cited, re-ask, copy |
| 8 | Aesthetic and Minimalist Design | 3 | Heavy first answer; trail labels collide |
| 9 | Error Recovery | 3 | Offline card good; command breaks mid-flag, no copy; no-match undesigned |
| 10 | Help and Documentation | 2 | "Template" and history range unexplained |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
LLM: partly specific. Shell generic (chat bubbles, composer, Geist on near-white); card interior specific (cite chip to row linking, Intent line, A2 time trail, breadcrumb mark, "Nothing leaves it").
Detector: CLI clean (exit 0). Browser overlay 20 flags; real: straggler in First open copy, overused-font Geist 81%. False positives: 7 low-contrast + 2 line-length on companion captions, skipped-heading from page outline, 11 nested-cards from the mockup's panel border.

## Priority Issues
1. [P1] No-match / zero-result / answer:null states undesigned. Fix: no-match card naming the searched Intent, details open, history start date, one-tap re-asks. Command: harden
2. [P1] Thread does not scale (~300px cards, up to 10 rows, inline details; A1 clips). Fix: scrollable thread, scroll new question to top, cited rows first max 3 + "Show N more", collapse older cards. Command: layout
3. [P1] Accessibility semantics: spans/divs/hrefless anchors as controls, no focus-visible, colour-only cited cue, 16px chips, no live region. Fix: real buttons/links, aria-expanded, labels, focus ring, non-colour cue, aria-live, 24px targets. Command: audit, harden
4. [P2] Citation order (3,2,1) and trail legibility (merged ticks, colliding labels, ambiguous end "12 AM"). Fix: number in answer order, merge close ticks with count, labels above, "Sun 12 AM", caption. Command: clarify
5. [P2] Waiting and Template opaque: no Stop, skeleton jumps, Template has no reason. Fix: show Intent + rows first, Stop + elapsed after 2 s, reason on pill. Command: harden

## Persona Red Flags
Alex: no Enter hints; read-only Intent; hover-only open; no Stop; "+" erases with no undo.
Sam: controls not focusable; no focus styles; colour-only cited; trail visual-only; no announcements; code wraps, no copy.
Jordan: h1 repeats placeholder; example arrows imply navigation; no history range; LLM/Template unexplained.

## Minor Observations
Straggler "it."; top bar shifts on first open; Send active offline; "up to 10" vs 3 rows; template bolds long title; "Local" vague; 11/12px merge.

## Questions to Consider
Why is the Intent line the smallest grey text and not editable? Does the everyday user need "LLM · 1.2 s"? Could rows be the answer for list questions? Should rows appear before the LLM speaks?
