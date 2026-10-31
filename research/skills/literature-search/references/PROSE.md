# Review Prose Pass

Register and wording rules for a single editing pass over a drafted literature review. The pass runs
after `review-<slug>.md` is written and before the review is reported, and it changes only how
sentences read. Evidence is out of scope: the invariants below say exactly what it may not touch.

## Boundary

This is a writing-quality pass. It is not a tool for evading AI-text detectors, and it must not be
documented or used as one. Detector verdicts are unreliable, and prose that reads as machine-written
is not thereby machine-written. The reason to run the pass is narrower: inflated, vague, or formulaic
prose makes a review harder to appraise, because a reader cannot tell a strong finding from a padded
sentence.

A review is also not a blog post. Most published "humanizer" advice targets marketing and personal
writing and tells the writer to add voice, use contractions, drop hedges, and vary word choice. Three
of those four are wrong for a review. See the calibration table.

## Hard invariants

The pass may not break any of these. If a fix would break one, leave the sentence as it is.

a. **No evidence moves.** No finding, number, count, date, sample size, effect size, or any claim a
   `[n]` marker supports is added, removed, or altered. Unevidenced appraisal that the review itself
   added ("groundbreaking", "transformative", "not merely technical") is wording, not evidence, and
   may be cut. Editing is otherwise limited to wording, sentence boundaries, and sentence order
   inside a paragraph.
b. **No marker crosses a claim boundary.** Merging two sentences carries both sets of markers into
   the merged sentence; splitting one keeps every marker with the clause it came from. The multiset
   of `[n]` markers in the body is identical before and after: none is added or dropped, and a
   marker moves only inside its own sentence, to sit next to the clause it supports.
c. **References are byte-identical.** The `## References` section is not edited at all: not its
   ordering, numbering, punctuation, capitalization, or whitespace.
d. **Method counts are untouched.** Candidate, included, and excluded counts, the named databases,
   and the dates in `## Method` keep their exact values.
e. **Quoted text is untouched.** Wording quoted from a paper stays verbatim, AI tells and all. Fix
   the sentence around the quote instead.
f. **No invention.** If a sentence can only be improved by supplying a detail the included papers do
   not provide (a sample size, a year, a mechanism), leave it alone. A vague sentence is a much
   smaller defect than a fabricated one.
g. **Structure is unchanged.** The headings, their order, and the section each sentence sits in are
   the drafted ones.

## Academic calibration

General de-AI advice has to be filtered before it is applied to a review.

| Common advice | What a review does instead |
|---|---|
| Cut hedges, sound confident | Keep every hedge that matches evidence strength ("suggests", "in two small studies", "associated with"). Cut only stacked or empty hedging: "may potentially indicate" becomes "may indicate". |
| Avoid passive voice | Passive is correct where the actor is the review itself: "Records were screened by title and abstract" stays. Prefer active where a paper is the actor: "Chen et al. report". |
| Add voice and personality | None. Neutral third person, no opinions, no address to the reader, no rhetorical questions. |
| Vary your word choice | One term per construct. Cycling "agents", "systems", and "frameworks" for the same thing makes a reader suspect three different things are meant. Pick the term the literature uses and repeat it. |
| Use contractions | No contractions. |
| Use dashes for rhythm | ASCII punctuation only: hyphen-minus, straight quotes, straight apostrophes. No em dash, no en dash, no typographic quotes, no emoji. |

Replacing a dash: a parenthetical pair of em dashes becomes commas or parentheses; a single em dash
joining two clauses becomes a colon, a semicolon, or two sentences; an en dash in a numeric range
becomes a hyphen ("2019-2024") or the word "to".

Terminology, acronyms, and variant spellings are fixed on first use and never alternated afterwards.

## Pattern catalogue

Each entry gives the tell, then a before and after. Every after keeps the markers and the numbers.

**Significance inflation.** Routine results described as landmark, pivotal, groundbreaking,
transformative, or paradigm-shifting; a single study called "a major advance".
- Before: Chen et al. report a groundbreaking improvement in diagnostic accuracy, rising from 71% to 78% [4].
- After: Chen et al. report diagnostic accuracy rising from 71% to 78% [4].

**AI vocabulary.** Replace in the left column, keep the technical senses noted on the right.

| Replace | With |
|---|---|
| delve into, dive into | examine, analyze |
| underscores, highlights (as a verb of evidence) | shows, indicates, or delete |
| pivotal, crucial, vital, essential | important, or delete |
| landscape, realm, tapestry, arena | field, literature, or delete |
| intricate | complex, or name what is complex |
| showcase | show, report, demonstrate |
| leverage, utilize | use |
| robust | keep for the statistical sense (robust standard errors, robust to specification); otherwise state what held, or delete; if the draft does not contain the detail, leave the word (invariant f) |
| seamless, seamlessly | delete, or state the integration; if the draft does not contain the detail, leave the word (invariant f) |
| significant | keep for statistical significance with a reported test; in review voice, replace it with the reported number, never with another magnitude word |
| notably, importantly, interestingly | delete |
| furthermore, moreover, additionally (in chains) | delete the connective; join the sentences only when both halves are supported by the same markers |
| comprehensive, exhaustive | delete unless the search met a stated definition of coverage |
| myriad, plethora | many, or the count |
| it is worth noting that, it is important to note that | delete |
| in order to | to |
| due to the fact that | because |
| a number of | several, or the count |

**Copula avoidance.** "Serves as", "stands as", "functions as", "represents", "boasts", "features"
where "is" or "has" is meant.
- Before: Retrieval augmentation serves as a mechanism for grounding outputs in retrieved text [7].
- After: Retrieval augmentation grounds outputs in retrieved text [7].

**Trailing participial riders.** A clause appended with "-ing" that adds commentary the cited paper
did not make: ", highlighting the importance of ...", ", underscoring the need for ...",
", demonstrating the potential of ...". If the rider is a claim one of the cited papers does make,
keep it inside the same sentence so it stays under that sentence's markers. Otherwise cut it.
- Before: Two trials reported no difference in time to diagnosis [9], highlighting the importance of workflow integration.
- After: Two trials reported no difference in time to diagnosis [9].

**Vague attribution.** "Studies show", "researchers argue", "it is widely recognized", "the
literature suggests", with no marker. An uncited generalization in a review is an evidence defect,
not a style defect. Fold it into an adjacent sentence only when that sentence already states the
claim; otherwise cut it. Never attach a marker that was not already there (invariant b).
- Before: Studies show that multi-agent designs improve reliability. Two evaluations report fewer unsupported recommendations [3][8].
- After: Two evaluations report fewer unsupported recommendations from multi-agent designs [3][8].

**Negative parallelism.** "Not only X but also Y", "it is not X, it is Y", "this is less about X than
about Y". Keep the half that carries the content.
- Before: The contribution is not merely technical, it is methodological [12].
- After: The contribution is methodological [12].

**Forced triads.** Three-item lists where the third item is filler or is not evidenced.
- Before: The approach is accurate, scalable, and transformative [3].
- After: The approach is accurate and scalable [3].

**Signposting.** "This section explores", "Having examined X, we now turn to Y", "In what follows".
The headings already do this. Cut the sentence.

**Formulaic concession and upbeat closers.** "Despite these challenges, the field continues to
advance", "Future work will undoubtedly", "the future looks promising", "as the field matures".
In `## Synthesis` and `## Limitations`, cut them or replace them with the specific limitation the
draft already states (coverage, screening stage, retrieval, sample size).

**Chatbot residue.** "Great question", "I hope this helps", "As of my last update", "Let's explore",
"In today's fast-paced world", offers of further help, and any first-person address to the reader.
These are always cut.

**Template paragraph shape.** Every theme paragraph opening with the same frame ("Another key area
is ...", "A second strand of work ...") and running to the same length. Vary the opening to name the
finding instead, but never at the cost of precision.

## Procedure

1. Finish the review first. The pass needs a complete draft; do not interleave it with drafting.
2. Edit in place with `edit`, one sentence per patch, so every untouched sentence stays its own
   baseline. Never rewrite the file with `write`: `## References` and `## Method` are then outside
   the pass by construction.
3. List the tells section by section, each with the sentence it appears in. Do not edit yet.
4. Patch one sentence at a time. After each patch, re-read the patched lines and check invariants
   a, b, and e on that sentence before moving to the next.
5. Verify, and report the result:
   - Markers: re-read each edited sentence and confirm it carries the same `[n]` markers the patch
     replaced. Equal multisets per sentence, not just equal totals.
   - `## References` and `## Method`: no patch targeted either section. If one did, revert it.
   - Re-read each edited sentence: no number, year, or claim is new.
6. If a check fails, restore the pre-pass sentence and leave the tell in place. A review that still
   says "underscores" is acceptable. A review with a moved citation is not.

## Attribution

Pattern families adapted from the `avoid-ai-writing` skill by Conor Bronsdon (MIT,
https://github.com/conorbronsdon/avoid-ai-writing). Informed by Wikipedia's "Signs of AI writing"
(WikiProject AI Cleanup, https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing); no text is
reused from it.
The invariants, the academic calibration, and all examples here are this repository's own. Text from
the academic-research-skills plugin is deliberately not reused: it is CC BY-NC 4.0, which is
incompatible with this MIT-licensed repository.
