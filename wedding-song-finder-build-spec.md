# Wedding Song Finder — Build Spec

**For:** Robert
**From:** Julie
**Scope:** Scale `/first-dance-song-finder/` into a hub-and-spoke tool covering the wedding moments couples actually stress over.

---

## 0. The one-paragraph version

Keep the existing First Dance Song Finder exactly where it is, at its current URL, with its current rankings. Add a **new** hub page at `/wedding-song-finder/` that links out to moment-specific finders, each built on the same 5-question / 3-picks engine. Add a persistent "Your Wedding Music Plan" that tracks which moments a couple has chosen across all finders, and hand that plan off to the existing Ceremony Builder pre-filled. Ship three spokes first, measure, then decide on the rest.

**The non-negotiable:** one decision per page. The current tool converts because it promises 60 seconds and delivers. A hub that dumps six quizzes onto one screen is a menu, not a decision aid.

---

## 1. Architecture

```
/wedding-song-finder/                      NEW — hub
├── /first-dance-song-finder/              EXISTS — do not move, do not rename
├── /walking-down-the-aisle-song-finder/   NEW — Tier 1
├── /parent-dance-song-finder/             NEW — Tier 1
├── /wedding-party-entrance-song-finder/   NEW — Tier 2
├── /reception-entrance-song-finder/       NEW — Tier 2
└── /cocktail-hour-playlist-builder/       NEW — Tier 3, not a quiz
```

Downstream, unchanged:

```
/wedding-ceremony-songs/    Ceremony Builder — receives the plan pre-filled
/bookings/                  Inquiry
```

### Build order

| Phase | Ships | Gate to next phase |
| --- | --- | --- |
| 1 | Hub + Music Plan state + First Dance retrofitted onto the new engine | Hub gets traffic; plan-save rate measurable |
| 2 | Walking Down the Aisle, Parent Dances | ≥1 spoke matches First Dance's inquiry rate |
| 3 | Wedding Party, Reception Entrance | — |
| 4 | Cocktail Hour vibe picker | — |

Do not build all six at once. Each spoke is a real content investment (song pool, copy, FAQ, schema) and three good pages beat six thin ones.

---

## 2. The hub page — `/wedding-song-finder/`

**H1:** Find your wedding songs.
**Sub:** Six moments. One quiz each. Sixty seconds apiece, and you can stop after one.

### Layout

1. **Hero** — H1, sub, and the Music Plan progress state if one exists (returning visitor) or a single primary CTA into the First Dance finder if not (new visitor).
2. **Moment cards** — one card per spoke. Each card shows: moment name, one-line description, question count, and either "Start" or a checkmark + the chosen song if already completed.
3. **Music Plan panel** — see §4.
4. **Short guide** — 400–600 words on sequencing wedding music decisions (which moments to lock first and why). This is what makes the hub rank rather than being a bare link list.
5. **FAQ with schema** — see SEO plan.

### Card copy

| Moment | Card sub-line | Status |
| --- | --- | --- |
| First Dance | The one everyone's watching | Live |
| Walking Down the Aisle | The thirty seconds you'll remember | Phase 2 |
| Parent Dances | Father–daughter, mother–son, or your own version | Phase 2 |
| Wedding Party Entrance | Bridesmaids and groomsmen | Phase 3 |
| Reception Entrance | Your entrance as newlyweds | Phase 3 |
| Cocktail Hour & Dinner | Set the room, not a single song | Phase 4 |

Cards for unbuilt spokes should not render at all. Do not ship "coming soon" states — they read as an abandoned site.

**Important:** the hub must not be the default nav destination on day one. Nav keeps pointing at the First Dance finder until the hub has its own traffic. See SEO plan §3.

---

## 3. The quiz engine

Generalize what the First Dance finder already does. One config object per moment; the component is shared.

```js
{
  slug: 'parent-dance',
  title: 'Parent Dance Song Finder',
  moment: 'Parent Dance',
  questions: [ /* 5, see below */ ],
  pool: [ /* 30–40 songs, each with tags */ ],
  resultCount: 3
}
```

### Song object

```js
{
  title: 'Ribbon in the Sky',
  artist: 'Stevie Wonder',
  tags: ['soul', 'pre-1990', 'devotion', 'slow', 'timeless'],
  reason: 'Wonder at his most tender...',   // shown with the pick
  inRepertoire: true,                        // Julie can play it live
  featuredArrangementAvailable: true
}
```

`inRepertoire` drives the live-performance upsell on the result screen. Source of truth is the 255-song repertoire — see §7.

### Scoring

Simple additive tag match, which is almost certainly what the current quiz does. Each answer contributes tags; each song scores +1 per matched tag; return the top 3, with a tie-break on `inRepertoire: true` so Julie's own repertoire surfaces first among equals.

Guardrails:

- **No empty results.** If fewer than 3 songs score above zero, backfill from the pool's highest-`inRepertoire` entries rather than showing two picks.
- **No duplicate picks across moments.** If a song is already saved to the plan for another moment, deprioritize it. Nobody wants the same song for the first dance and the father-daughter dance.
- **Vary the output.** Two couples with identical answers should not get identical lists every time — shuffle within score bands. Otherwise the tool feels like a lookup table when couples compare notes, which they do.

---

## 4. Your Wedding Music Plan

This is the piece that makes the whole thing scale, and it is more valuable than any individual quiz.

### Behavior

- Persists in `localStorage` under one key, e.g. `jsm_music_plan`.
- Shape: `{ [momentSlug]: { title, artist, savedAt, quizAnswers } }`.
- A slim sticky bar appears on every finder page and the hub once at least one moment is saved: **"Your Wedding Music Plan · 2 of 6 moments"** with a progress indicator and an expand toggle.
- Expanded state lists saved moments, allows removal, and shows the next unfilled moment as a suggested action.
- Survives across sessions. Clears only on explicit reset or after a successful inquiry submission (matching the Ceremony Builder's existing behavior).

### Why it's worth the build

- **Zeigarnik effect** — an unfinished plan is an open loop. "2 of 6" is a reason to come back that a static results page does not have. This is what turns one visit into several.
- **Goal-gradient** — completion rate accelerates as the bar fills. Show the progress indicator, not just a count.
- **IKEA effect / endowment** — every moment a couple fills in is effort invested, which raises the perceived cost of hiring someone else.

### Handoff to the Ceremony Builder

Add a CTA in the expanded panel: **"Bring these into your ceremony builder →"**. It should pass the plan (query param or shared storage) so `/wedding-ceremony-songs/` opens with matching moments pre-selected rather than blank.

Mapping between the two, noting the vocabulary is not identical:

| Plan moment | Ceremony Builder moment |
| --- | --- |
| Walking Down the Aisle | Bride's Entrance |
| Wedding Party Entrance | Processional |
| First Dance | *(reception — not in builder; carry as a note)* |
| Parent Dance | *(reception — carry as a note)* |
| Reception Entrance | *(carry as a note)* |

Reception-side moments should land in the builder's "anything else" field as pre-written text so nothing is lost.

**Rename the Ceremony Builder's "Bride's Entrance" to "Entrance" or "Walking Down the Aisle."** Neutral naming widens the funnel to same-sex and non-traditional couples, who search different terms, and costs nothing with traditional couples.

---

## 5. The result screen — reorder it

The current First Dance finder ends with **"Save your picks (PDF) to share with your DJ."** That is the peak moment of the entire experience, and it currently routes the value to a competitor.

**Peak-end rule:** couples judge the tool by its best moment and its last one. The reveal is the peak. The last thing on screen should be the ask.

### New order

1. **The three picks**, each with its reason. Unchanged — this is the payoff.
2. **"Julie plays this one live."** Only rendered when a pick has `inRepertoire: true`. One line, plus the featured-arrangement note when applicable, plus an inquiry CTA. This is the conversion moment and it needs to be *inside* the result, not below it.
3. **"Send to your partner."** Existing share row. Keep — a shared link is a second qualified visitor and a commitment device.
4. **"Add to your Wedding Music Plan"** + next-moment prompt: *"Next up: walking down the aisle →"*.
5. **Download PDF.** Keep it, move it last. It's a genuine courtesy and it's a good lead magnet, just not the closing frame.

Everything above the fold on the result screen should be picks + live-performance CTA.

---

## 6. Spoke specs — Tier 1

### 6a. Walking Down the Aisle — `/walking-down-the-aisle-song-finder/`

**Pool:** ~35 songs. Draws heavily on the repertoire's Classical & Ceremonial (20), Sacred & Worship (9), plus contemporary picks that work instrumentally — Until I Found You, A Thousand Years, Can't Help Falling in Love, Make You Feel My Love, Iris, Somewhere Only We Know, and the cinematic entries in Film, Stage & Screen (Interstellar main theme, A Whole New World).

**Questions:**

1. **What kind of ceremony is it?** — Religious / house of worship · Secular, traditional feel · Secular, modern and relaxed · Outdoor or destination
2. **Instrumental or with vocals?** — Purely instrumental · Instrumental version of a song we love · Original recording with vocals · No preference
3. **How do you want the room to feel as you walk?** — Hushed and reverent · Warm and emotional, expect tears · Bright and joyful · Cinematic, like a film scene
4. **Classical, or something more personal?** — Traditional classical · Modern classical / film score · A pop song, arranged for strings · A hymn or worship song
5. **How long is the walk?** — Short, under 30 seconds · Standard, 30–60 seconds · Long aisle or large wedding party · No idea yet

Q5 is doing double duty: it's a genuine selection input (some pieces need a long runway) and it surfaces a logistical question most couples haven't considered, which builds authority. Add a one-line note in the result: *"Julie can cut or extend any arrangement to match your aisle length — this is standard."*

### 6b. Parent Dances — `/parent-dance-song-finder/`

**This is the highest-value spoke and the one with the thinnest current supply.** Treat the pool as a content gap to fill, not just a filter over existing songs.

**Pool:** ~35 songs. Current repertoire coverage is weak here — Country & Americana (10), plus My Girl, What a Wonderful World, In My Life, Forever Young, A Song for Mama, Isn't She Lovely, God Only Knows, Never Grow Up, Butterfly Kisses, Bless the Broken Road.

**Songs to add for adequate coverage** (Julie to confirm she'll learn these):

- *My Little Girl* — Tim McGraw
- *Stand By Me* — already in repertoire, tag it for this moment
- *Unforgettable* — already in, tag it
- *Landslide* — Fleetwood Mac (mother-son and father-daughter both)
- *Sweet Child o' Mine* — already in, works as a knowing father-daughter pick
- *Simple Man* — already in, standard mother-son
- *Humble and Kind* — Tim McGraw
- *You'll Be in My Heart* — Phil Collins

**Questions:**

1. **Which dance are you choosing for?** — Father–daughter · Mother–son · A parent dance that isn't either of those · Both, show me options
2. **What's the relationship like?** — Warm and easy, always has been · Close but not especially sentimental · Complicated, and the song matters more because of it · They're not here, and this is a tribute
3. **Their music, or yours?** — Something from their era · Something from ours · A song that's genuinely *theirs*, we know exactly the vibe · Neutral, just needs to feel right
4. **How much crying is acceptable?** — All of it, that's the point · Some, but we'd like to stay upright · Keep it warm rather than heavy · Actually we want it fun
5. **Genre lean** — Country · Soul and R&B · Classic rock and folk · Standards and jazz · Contemporary pop

Question 2's third and fourth options matter. Parent dances carry grief, estrangement, and absence more than any other wedding moment, and no competitor's tool acknowledges it. Handle those branches with care in the result copy — no jokes, no "celebration" framing on the tribute branch, and surface gentler, less lyrically-specific instrumental options there.

### 6c. First Dance — existing

Retrofit onto the shared engine. Do not change the URL, the H1, the meta title, or the question set — it is ranking and converting. The only changes: result screen reorder per §5, and Music Plan integration.

---

## 7. Song pool source of truth

The 255-song repertoire lives in `julie-schatz-repertoire.md` (and the matching PDF at `/assets/downloads/julie-schatz-repertoire.pdf`). Every quiz pool entry should either:

- exist in the repertoire → `inRepertoire: true`, eligible for the live-performance CTA; or
- be a well-known song outside it → `inRepertoire: false`, still a valid recommendation, and the result screen shows the custom-song path instead (+$200, 6 weeks lead time).

Roughly **70% of each pool should be `inRepertoire: true`.** Below that, the tool stops generating bookings. Above ~85% it stops feeling like honest advice and starts feeling like a sales sheet, which couples detect.

---

## 8. Analytics — instrument before you build more

Per finder, track:

- quiz start, quiz complete, completion rate
- result → inquiry click (**this is the number that matters**)
- result → share click
- result → PDF download
- plan save, plan moments count, return visit with existing plan
- plan → ceremony builder click

Phase 3 should not be built until at least one Phase 2 spoke matches the First Dance finder's result-to-inquiry rate. If Walking Down the Aisle draws traffic but doesn't convert, the answer is to fix the result screen, not to add more spokes.

---

## 9. Open questions for Julie

1. Which of the eight Parent Dance additions in §6b will you actually learn? That determines the pool.
2. Cocktail Hour vibe picker — piano repertoire or DJ playlists? These are currently separate offerings and the page needs to pick one.
3. Should the Reception Entrance finder route to the DJ booking page rather than violin? It's a higher-ticket booking.
