# Flute Learning App

Web-first bansuri learning platform with a premium guided UX and a microphone-based swara trainer MVP.

## What exists now

- product blueprint: `docs/bansuri-app-product-blueprint.md`
- Next.js app shell with:
  - premium landing page
  - learning-path overview
  - guided lesson checkpoints
  - live swara + octave trainer
  - basic scoring for pitch, octave, sustain, stability, and voicing

## App direction

- platform: web-first PWA
- style: calm, Apple-like, assistive
- core loop: target note → play into mic → detect → score → coach → retry

## Local run

1. `npm install`
2. `npm run dev`
3. open `http://localhost:3000`
4. visit `/trainer` and allow microphone access

## Current MVP notes

- tonic can be configured for Sa
- guided foundation lessons unlock in sequence with checkpoint gating
- detection currently uses `pitchy` for browser-side pitch estimation
- next major upgrade should add persistence, mic calibration, and richer melodic phrase scoring
