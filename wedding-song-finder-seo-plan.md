# Wedding Song Finder — SEO & URL Migration Plan

**The single most important line in this document:** do not rename, move, or redirect `/first-dance-song-finder/`. Build the hub as a new page alongside it.

---

## 1. Why the rename is the risk

`/first-dance-song-finder/` is an exact-match URL for a high-intent commercial query, it has an optimized title, a rich FAQ block, and — per Julie — it is already earning traffic. That traffic is the asset. The page title is not.

If it is renamed to "Wedding Song Finder" and moved to a new URL, three things happen:

1. **Ranking reset risk.** A 301 passes most authority but not all, and re-indexing at the new URL takes weeks to months. Any accumulated ranking for *first dance* queries is at risk during that window — which is the entire point of the page.
2. **Relevance dilution.** "Wedding Song Finder" is a broader, vaguer query with more established competitors (The Knot, Zola, WeddingWire, myweddingsongs). "First dance song finder" is a niche Julie can plausibly own. Trading a term you rank for against a term you don't is a downgrade even if the new term has more volume.
3. **Lost backlinks and shares.** Every Pinterest pin, forum link, and shared results link points at the current URL. Redirects survive, but the share-link feature means there are live URLs in couples' text threads right now.

**Second-order thinking:** the instinct is "broader name = more traffic." The actual mechanism is the opposite. Specific pages rank; general pages get outranked by directories with more authority. The hub's job is internal navigation and topical clustering, not head-term ranking.

---

## 2. Target structure

| URL | Status | Primary query intent | Title tag |
| --- | --- | --- | --- |
| `/first-dance-song-finder/` | **Live — unchanged** | first dance song finder / quiz | *Keep exactly as-is* |
| `/wedding-song-finder/` | New | wedding song finder / wedding music quiz | Wedding Song Finder — Free Song Quizzes for Every Moment |
| `/walking-down-the-aisle-song-finder/` | New | songs to walk down the aisle to | Walking Down the Aisle Song Finder — 60-Second Quiz |
| `/parent-dance-song-finder/` | New | father daughter dance songs / mother son dance songs | Parent Dance Song Finder — Father–Daughter & Mother–Son |
| `/wedding-party-entrance-song-finder/` | Phase 3 | bridesmaids entrance songs / groomsmen walk in songs | Wedding Party Entrance Song Finder |
| `/reception-entrance-song-finder/` | Phase 3 | wedding reception entrance songs | Reception Entrance Song Finder |
| `/cocktail-hour-playlist-builder/` | Phase 4 | wedding cocktail hour songs | Cocktail Hour Playlist Builder |

### Naming rationale

Every spoke URL keeps the `-song-finder` suffix. This is deliberate: it builds a recognizable page-type pattern that helps both users and crawlers understand the cluster, and each URL still contains its own head term. `/parent-dance-song-finder/` beats `/finder/parent-dance/` — flat, keyword-bearing URLs outperform nested abstractions at this site size.

**Do not split parent dances into two URLs.** `/father-daughter-dance-songs/` and `/mother-son-dance-songs/` would cannibalize each other and split link equity across two thin pages. One page, both queries served by an H2 each, with question 1 of the quiz branching. Same logic kills separate bridesmaids and groomsmen pages.

---

## 3. Rollout sequence

**Phase 1 — hub goes live, quietly.**

- Publish `/wedding-song-finder/` with the hub content and the First Dance card.
- **Nav stays pointed at `/first-dance-song-finder/`.** Do not swap the nav item on day one — that redirects your strongest internal link away from your ranking page before the hub has proven anything.
- Add a link from the First Dance finder *to* the hub, low on the page ("Planning music for other moments? →"). One-way for now.
- Submit the hub in Search Console, request indexing.

**Phase 2 — spokes ship, links go two-way.**

- Publish the two Tier 1 spokes.
- Each spoke links up to the hub and laterally to the First Dance finder.
- Hub links down to all live spokes.
- **Now** change the nav: `Songs ▸` submenu becomes *Ceremony Repertoire · Wedding Song Finder*, with the First Dance finder listed as a child of the hub. The First Dance page still gets an internal link from the hub, which is the strongest page on the cluster by then.

**Phase 3 — measure before extending.**

Do not publish Phase 3 spokes until the Phase 2 pages are indexed and ranking for *something*. Two ranking spokes is a cluster; six unranked spokes is thin-content risk.

---

## 4. Internal linking

The cluster only works if links flow correctly. Target state:

```
Hub  ←→  each spoke            (two-way, in-body not just nav)
Spoke →  Ceremony Builder      (via the Music Plan CTA)
Spoke →  relevant location page  (NYC / NJ / CT — one contextual link each)
Ceremony Builder → Hub         (replaces the current First Dance-only link in its FAQ)
Blog posts → relevant spoke    (see §7)
```

Two existing links to update once the hub is live:

1. Ceremony Builder FAQ, *"Still picking your first dance song?"* → point at the hub, mention the first dance finder by name within the answer.
2. Footer *Music* column, `First Dance Song Finder` → add `Wedding Song Finder` above it, keep both.

---

## 5. Schema

Each spoke needs its own structured data. Reuse the pattern already on the First Dance finder.

- **`FAQPage`** on every spoke — minimum 5 Q&As, written to match how couples actually phrase the question. This is what earns the rich result and it is the highest-leverage item on this list.
- **`WebApplication`** or `SoftwareApplication` on each finder, with `applicationCategory: "LifestyleApplication"` and `offers: { price: "0" }`. Free tools genuinely get treated differently.
- **`BreadcrumbList`** — Home › Wedding Song Finder › [Spoke]. Gives the hub a visible role in SERPs.
- **`Organization` / `Person`** for Julie — already sitewide, confirm it's inherited.

### FAQ questions per spoke

Write these to mirror real search phrasing, not marketing phrasing.

*Walking Down the Aisle:* What song should I walk down the aisle to? · Can you walk down the aisle to a non-classical song? · How long should the processional song be? · Do I need a different song than my bridesmaids? · Can Julie play our aisle song live on violin?

*Parent Dance:* What is a good father–daughter dance song? · What is a good mother–son dance song? · How long should the parent dance be? · What if a parent has passed away? · Can we do one combined parent dance?

The "what if a parent has passed away" question is a genuine search with almost no good answers online, and it's the kind of thing that earns links and trust. Answer it properly and without upsell.

---

## 6. Cannibalization audit

Three existing pages now overlap with the cluster. Resolve explicitly:

| Page | Overlap | Resolution |
| --- | --- | --- |
| `/wedding-ceremony-songs/` | Covers processional, bride's entrance, recessional as *selectable moments* | Different intent — browse-and-quote vs. help-me-decide. Keep both. Ensure the Builder's copy says "browse and build," never "find" or "quiz." |
| `/first-dance-song-finder/` | Hub will target overlapping terms | Hub must not use "first dance" in its title tag or H1. Keep the hub's language at the *wedding music* level. |
| `/blog/` | Any existing song-list posts | Audit. Any post targeting a spoke's head term should be shortened, refocused on a sub-angle, and link to the spoke as the primary resource. |

The Ceremony Builder currently ranks for repertoire/browse queries. The spokes will target decision queries. As long as the title tags and H1s stay in their lanes, they complement rather than compete.

---

## 7. Content support

Each spoke needs at least one supporting blog post linking into it, or it sits as an orphan tool page with nothing feeding it. Suggested angles that don't duplicate the spoke itself:

- *How long should each wedding song be?* → links to all spokes
- *What to do when a parent has passed: music that honors them* → parent dance spoke
- *Instrumental vs. original recording: which for your aisle walk?* → aisle spoke
- *We built a wedding song quiz. Here's what 500 couples picked.* → hub, once there's data. This is the one most likely to earn links.

---

## 8. Measurement

Set a baseline in Search Console **before** anything ships. Export current impressions, clicks, average position, and top queries for `/first-dance-song-finder/`.

**The tripwire:** if that page's clicks drop more than 20% week-over-week after the hub launches, stop and check for cannibalization — most likely the hub competing for first-dance queries. Fix by tightening the hub's title tag and H1 away from "first dance."

Review at 30 / 60 / 90 days:

| Metric | Where | What good looks like at 90 days |
| --- | --- | --- |
| First Dance finder clicks | Search Console | Flat or up. Never down. |
| Hub impressions | Search Console | Indexed and impressing on *wedding song* terms |
| Spoke ranking | Search Console | Each spoke ranking for its head term, any position |
| Result → inquiry rate | Analytics | Each spoke within range of First Dance's rate |
| Plan saves | Analytics | The leading indicator for return visits |

Julie's own Search Console data beats any third-party volume estimate for deciding which spokes to build next — check which *first dance* long-tails already bring impressions, since adjacent moments will follow similar patterns for this audience and geography.

---

## 9. Checklist

- [ ] Export Search Console baseline for `/first-dance-song-finder/`
- [ ] Confirm no redirect, rename, or canonical change on that URL — ever
- [ ] Publish hub, nav unchanged, one-way link from First Dance finder
- [ ] Submit hub for indexing
- [ ] Publish Tier 1 spokes with FAQPage + WebApplication + BreadcrumbList schema
- [ ] Two-way internal links; update Ceremony Builder FAQ link and footer
- [ ] Swap nav to hub
- [ ] Rename "Bride's Entrance" → "Entrance" in the Ceremony Builder
- [ ] Blog audit for cannibalization
- [ ] 30-day review against tripwire
