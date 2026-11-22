# QualCheck

A privacy-first web app for coding qualitative interviews with two AI readers and a human yardstick.

- **Laptop reader:** Gemini Nano runs inside Chrome (Firebase AI Logic, `ONLY_ON_DEVICE`) and reads the original transcripts. They never leave the computer.
- **Access copies:** names, places and contact details are hidden, then the researcher approves each copy.
- **Cloud reader:** Gemini (Firebase AI Logic, `ONLY_IN_CLOUD`) reads only the approved access copies.
- **You are the yardstick:** both readers are scored against the researcher's own calibration sample (Cohen's κ per code), and the researcher decides every disagreement.
- **Report:** an APA-style findings report with figures, an agreement table, a methods paragraph and a data-flow statement built from the log of every AI call.

Built for the Firebase #BuildHybridAI hackathon (2026). Work in progress.

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:5173 (open in Chrome with the on-device model)
npm test           # unit tests (Vitest)
npm run typecheck
npm run build
```
