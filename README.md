# QualPair

**Code qualitative interviews with two AI readers, and keep yourself as the yardstick.**

Researchers who analyse confidential interviews (health, migration, NGO evaluations) can't paste transcripts into a chatbot, and they can't show a supervisor or ethics board how reliable AI coding is. QualPair splits the work so the private part stays on the laptop:

| Step | Who reads | What they see | Where it runs |
|---|---|---|---|
| Your sample | You | A random 10–25% of paragraphs | This browser |
| Laptop reader | Gemini Nano | **Original transcripts** | **On this computer** (Firebase AI Logic, `ONLY_ON_DEVICE`, no cloud fallback) |
| Access copies | You approve | Names, places, phones, emails and dates hidden | This browser (rules + laptop-reader suggestions) |
| Cloud reader | Gemini 3.5 Flash-Lite | **Approved access copies only** + code definitions | Cloud (Firebase AI Logic, `ONLY_IN_CLOUD`, App Check) |
| Agreement | — | Cohen's κ per code, each reader vs you | This browser |
| Disagreements | You decide | Where the two readers differ | This browser |
| Report | — | APA-style findings report, methods and data-flow statement | This browser → Word / PDF |
| Exchange | — | Whole project as REFI-QDA (`.qdpx`) for NVivo, ATLAS.ti, MAXQDA, QualCoder | This browser |

**Works with the tools researchers already use.** The report's *More* menu exports the whole study as a REFI-QDA project (`.qdpx`, checked against the official schema): the interviews, the codebook, and each paragraph's coding under four users (you, the laptop reader, the cloud reader, and the final coding after your review), with decision memos as notes. *Open .qdpx project* on the Studies page brings interviews and a codebook in from NVivo, ATLAS.ti, MAXQDA or QualCoder; *Import .qdc* adds a codebook. Coding from another program isn't copied in, because QualPair scores each reader against your own sample.

Every AI call is logged (time, where it ran, model, prompt version); cloud calls keep the exact text sent.

**Live:** https://pilot-375c7.web.app · built for the Firebase #BuildHybridAI hackathon (2026).

**Two ways to look:** *Try it on 6 real interviews* starts a fresh copy of the sample study so you can run both readers yourself. *See a finished study* opens the same interviews after a real run (22 Nov 2026): the sample coded by the QualPair team, all 263 paragraphs coded by Gemini Nano in Chrome and by gemini-3.5-flash-lite, so the agreement table, disagreements and report are there at once.

## How the hybrid AI is used

- **Explicit modes, never "prefer".** Raw transcripts only ever go to `InferenceMode.ONLY_ON_DEVICE`; if Gemini Nano isn't available, the laptop reader refuses rather than falling back to the cloud.
- **A type guard for the cloud.** The cloud reader only accepts `ApprovedAccessSegment`, whose text type (`ApprovedText`) can only be created by `approveForCloud()`. That function refuses copies with undecided suggestions or with any "always hide" name still visible. A unit test checks that listed names never reach the cloud.
- **Structured output on both sides.** The laptop reader uses Chrome's `responseConstraint` (JSON Schema with the code names as an enum); the cloud reader uses `responseJsonSchema`. Evidence quotes are kept only if they are exact substrings of the paragraph.
- **Remote Config for what may change.** The cloud model name and the starting pass mark and sample size for new studies come from Firebase Remote Config, with built-in defaults that work offline. The report names the model each study actually used.
- **Works offline.** After the first visit the app and the laptop reader run with no connection; only the cloud reader waits for one.
- **Measured, not assumed.** Both readers are scored per code against the researcher's own sample, with the pass mark fixed before any reader runs. Codes below the pass mark are held back from the report.

## Evaluation (real data, single expert reference)

Le Foll (2025), *Semi-structured interviews with linguists about Open Science* (Zenodo, CC BY-SA 4.0): 12 thematic codes, interviewee turns as units, random sample of 200 (seed 2026). The reference is one expert coder, not a gold standard. Code definitions were written by us from the code names (the dataset has labels only). Thresholds were decided before results: macro κ ≥ 0.40 = useful first pass, ≥ 0.60 = good.

| Reader | Units | Macro κ | Time |
|---|---|---|---|
| Cloud reader (gemini-3.5-flash-lite) | 200 | **0.46** (moderate) | 0.2 s per unit (batched) |
| Laptop reader (Gemini Nano, Chrome 158 on a Windows laptop) | 200 | **0.30** (fair) | 16.4 s per unit, after a one-off ~1 min load |

Both runs use the same 200 units. The cloud reader clears the 0.40 "useful first pass" line we set in advance; the laptop reader does not on this dataset (per code it ranges from κ 0.05 to 0.65). That gap is the reason QualPair scores each reader against the researcher's own sample and holds back codes below the pass mark, instead of trusting either reader by default.

Per-code results are in `results/`. Run it yourself at `/eval`.

## Develop

```bash
npm install
npm run dev          # http://127.0.0.1:5173 — open in desktop Chrome with Gemini Nano
npm test             # unit tests (Vitest): parsing, κ/AC1, de-identification, full flow, cloud privacy, exports
npm run typecheck
npm run build
npx playwright test  # browser tests with practice readers: full flow, offline, import, REFI-QDA round trip
REAL_CLOUD=1 npx playwright test e2e/cloud-real.spec.ts   # real cloud reader via the dev server
```

- `?practice` turns on **practice readers** (keyword rules, no AI) for browsers without Gemini Nano. They are always labelled in the app and in any report.
- Local App Check: put `VITE_APPCHECK_DEBUG_TOKEN=…` in `.env.local` (dev only; never included in production builds).

## Architecture

Static single-page app: **Vite + React + TypeScript**, data in **IndexedDB (Dexie)**, **Firebase AI Logic** with **App Check (reCAPTCHA Enterprise)**, **Remote Config**, **Firebase Hosting**, offline-capable **PWA**. No backend, no accounts: studies never leave the browser except the approved access copies sent to the cloud reader. Firestore and Authentication are left out on purpose: storing transcripts in a cloud database would break that promise.

```
src/
  domain/   import (speaker turns, code-point offsets), deid (rules + approval guard), stats (κ, AC1, PABAK, seeded sampling)
  ai/       device.ts (ONLY_ON_DEVICE), cloud.ts (ONLY_IN_CLOUD), practice.ts, prompts.ts (versioned)
  services/ study data, sample coding, reader runs, access copies, agreement, disagreements, report, exports
  features/ one folder per screen
```

## Data and licences

- Code: **Apache-2.0** (see `LICENSE`).
- Sample study: Zhang, J. (2026). *Interview data: Attitudes towards and experiences of healthcare seeking, self-management of common infections, and antibiotic use among Chinese and Indian international students in the UK* [Data set]. Zenodo. https://doi.org/10.5281/zenodo.23371232 — **CC BY 4.0**. Six transcripts, unchanged apart from conversion to text.
- Evaluation: Le Foll, E. (2025). *Semi-structured interviews with linguists about Open Science* [Data set]. Zenodo. https://doi.org/10.5281/zenodo.17630137 — **CC BY-SA 4.0**; `public/eval/le-foll.json` is a derived file under the same licence.
