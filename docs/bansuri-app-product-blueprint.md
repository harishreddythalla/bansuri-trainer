# Bansuri Learning App - Research, Curriculum Synthesis, and Product Blueprint

Date: 2026-05-01

## 1. Recommended product direction

Build this as a **web-first PWA**, not a native app, for v1.

Why:

- browser microphone access is mature through `MediaDevices.getUserMedia()` and the Web Audio API
- we can ship faster across desktop, tablet, and mobile without maintaining iOS + Android separately
- the most important MVP feature is real-time listening and scoring, which is practical on the web
- onboarding links, lesson sharing, community features, and instant updates are much easier in a web product
- later, if needed, we can wrap the web app with Capacitor for app stores

## 2. Market scan - what existing products already do

### A. Dedicated bansuri / flute learning products

| Product | What it offers today | Gaps we should beat |
|---|---|---|
| The Bansuri App | Real-time pitch detection, swara display, rhythm game, structured video lessons, quizzes, progress tracking, customizable Sa, Hindi/English support | still feels like content + tools, not a full adaptive learning system |
| Divine Bansuri | Detailed course catalog, HD lessons, PDFs, tanpura + tabla MP3s, doubt chat, voice notes to instructor, reminders, live/recorded access | mostly teacher-content delivery, not automated two-way assessment |
| myGurukul | Hindustani and Carnatic flute masterclasses, diploma tracks, notations, offline content, module purchases, lesson submission for evaluation | strong curriculum, but not instant practice intelligence |
| SGS Datta Venu | Video lessons, progress tracking, metronome, reminders, live class registration, multilingual learning | lighter interactivity, no advanced automated listening loop |
| iSM Circle Bansuri | beginner/intermediate/advanced tracks, modules, certification, mentor feedback, learning materials | strong academy structure, but not a software-first practice engine |

### B. Practice companion apps that solve part of the problem

| Product | What it offers today | Gap |
|---|---|---|
| Riyaz | AI-guided pitch/timing feedback, large lesson library, progress metrics, song practice, leaderboard | built for voice first, not bansuri-specific technique or fingering progression |
| Swar Meter | real-time swara display via microphone, visual pitch feedback | useful tuner, not a learning journey |
| Shruti Carnatic Tuner | Carnatic swara detection, accuracy display, reference tones, any sthayi/kattai support | tuner/teaching aid, not curriculum + gamification |
| Rhythm with Tabla & Tanpura / Bandish / Singtico / SurSadhak | tabla, tanpura, taals, recording, bandish/practice support | essential utilities, but not end-to-end teaching products |

## 3. What good bansuri curricula actually cover

### Hindustani patterns found across academies

Across The Mystic Bamboo, myGurukul, iSM Circle, and course ecosystems, the learning order is very consistent:

1. choosing the flute  
2. posture, lip placement, holding, finger placement  
3. sound production and first stable tone  
4. seven swaras  
5. long notes and breath control  
6. saptak / octave awareness  
7. alankars in multiple speeds  
8. laya and tala basics  
9. 12 swaras, 10 thaats, raga introduction  
10. beginner ragas like Bhoopali / Yaman  
11. composition, sthayi, antara, taans, tihayis  
12. advanced ornamentation: khatka, murki, gamak, meend, tonguing  
13. performance format and longer raga development

### Carnatic patterns found across academies

Across Acharyanet and CarnaticFlute.in, the structure is similarly systematic:

1. posture, blowing, basic fingering  
2. scales and octave awareness  
3. sarali / dhatu / jantai varisais  
4. mandra sthayi and tara sthayi control  
5. swarasthanas and basic theory  
6. alankarams in tala  
7. geethams / pillari geethams / sanchari geethams  
8. foundational ragas like Mayamalavagowla, Shankarabharanam, Kalyani  
9. tala system, adi tala, 7 basic talas, 35 suladi talas  
10. varnams  
11. kritis and concert-oriented expression  
12. gamakas and advanced phrasing  
13. manodharma / improvisational maturity

### Cross-cutting curriculum patterns

The strongest programs all combine:

- video or live demonstration
- notation / PDFs / study material
- multi-speed practice
- theory tied to actual playing
- assignments or evaluations
- beginner-to-advanced structure
- occasional motivational song learning
- some kind of mentor or feedback path

## 4. What the current market is still missing

This is the big opportunity.

Most products are one of these:

- **course-first**: lots of videos, weak feedback
- **tuner-first**: good pitch detection, weak curriculum
- **utility-first**: tanpura/tabla/metronome, no teaching engine
- **mentor-first**: live feedback exists, but not scalable or instant

What is still missing is a product that is:

- instrument-specific to bansuri
- interactive at every step
- curriculum-driven from absolute beginner to advanced performer
- equally useful for Hindustani and Carnatic learners
- able to listen, score, explain, gate progression, and adapt drills automatically

That is exactly the product we should build.

## 5. Product vision

Create the **best digital bansuri guru-companion**:

- teaches from zero to advanced
- listens continuously through the microphone
- gives instant swara, octave, rhythm, breath, and steadiness feedback
- unlocks progress only after the learner proves mastery
- supports both **Hindustani** and **Carnatic** paths from one product
- feels premium, calm, and beautifully designed

## 6. Product concept

### Working idea

**A web-first, AI-assisted, gamified bansuri learning studio**

### Core product pillars

1. **Structured learning path**  
   not a random video library; a real syllabus

2. **Two-way interactive practice**  
   the app asks, the learner plays, the app listens and scores

3. **Riyaz intelligence**  
   daily practice coach, personalized drills, practice streaks

4. **Tradition-aware learning**  
   proper swara naming, octave notation, ragas, talas, theory, and style differences

5. **Beautiful, low-anxiety UX**  
   premium, clean, supportive, not cluttered

## 7. Feature blueprint

### A. Onboarding and setup

- choose path: Hindustani / Carnatic / Both
- choose level: absolute beginner / some experience
- choose flute scale and handedness
- microphone setup + noise calibration
- detect or set personal Sa / shruti
- first “sound coming or not” diagnostic
- personalized starting plan

### B. The learning map

The product should feel like a guided map, not a folder of lessons.

#### Foundation world

- flute anatomy
- buying the right flute
- holding posture
- lip alignment
- first sound
- stable airflow
- finger coverage

#### Swar world

- Sa Re Ga Ma Pa Da Ni recognition
- each swara in 3 octaves
- long-note holding
- stability training
- ascent/descent exercises
- swara ear training

#### Alankar world

- beginner alankars
- multi-speed alankars
- mirrored patterns
- stamina drills
- accuracy unlocks

#### Laya and tala world

- clapping and counting
- metronome sync
- teen taal / adi tala and other core cycles
- play-on-beat exercises
- off-beat awareness

#### Raga world

- aroha / avaroha
- pakad / prayogas
- phrase imitation
- phrase completion
- raga quizzes
- guided raga play

#### Song and composition world

- simple melodies
- geethams / bandish / bhajans / film tunes
- line-by-line playback
- call-and-response
- auto-scored performance attempts

#### Advanced expression world

- meend
- murki
- khatka
- gamak
- tonguing
- taans
- improvisation prompts
- performance simulations

### C. Two-way interactive engine

This is the soul of the app.

Every playable lesson should support:

- app demonstrates target note / phrase
- app shows fingering + notation + expected octave
- learner records live through mic
- app classifies what note was actually played
- app checks whether it was voiced or noisy
- app scores pitch accuracy, steadiness, timing, sustain, and cleanliness
- app gives a simple explanation, not just a number
- app assigns targeted retry drills when the learner misses

### D. Specific interactive exercise types

#### Note challenge

- “Play Madhya Sa”
- “Play Tara Pa”
- “Play Mandra Ni for 3 seconds”

#### Sustain challenge

- hold a note inside a cents tolerance band
- score based on duration and pitch stability

#### Swara ladder

- play Sa Re Ga Ma ascending
- play Ma Ga Re Sa descending

#### Call-and-response

- hear a short phrase
- repeat it
- app compares note sequence and timing

#### Alankar runner

- scrolling pattern
- beat-guided practice
- speed unlocks

#### Taal lock

- app plays tanpura + tabla / metronome
- learner must land on sam correctly

#### Raga phrase tutor

- practice core phrases
- detect wrong swaras or weak phrasing

#### Gamaka trace

- app shows target pitch contour
- learner tries to match the contour
- score based on shape similarity, not just final note

#### Performance checkpoint

- mini-recital submission
- pass threshold required to unlock next module

### E. Gamification

Do not make this childish. Make it elegant and motivating.

- streaks
- XP
- mastery levels per swara
- “clean note” badges
- “perfect sustain” medals
- speed unlocks
- weekly riyaz goals
- skill tree
- boss levels at end of modules
- seasonal practice challenges
- gentle leaderboard for opt-in community users

### F. Daily riyaz assistant

- daily warmup routine
- auto-generated based on yesterday’s errors
- reminders
- tanpura + metronome presets
- “today’s 15-minute plan”
- fatigue-aware practice suggestions
- weekly reflection summary

### G. Learning aids

- swara-to-frequency visualizer
- fingering charts
- octave map
- notation view
- beat counter
- breath timer
- practice journal
- glossary for terms like sthayi, thaat, aroha, avaroha, gamaka, taan, tihayi

### H. Community and teacher layer

Phase 2 or 3:

- student recordings
- teacher review mode
- batch classes
- doubt posting
- challenge rooms
- duet / follow-along rooms
- optional certification track

## 8. Curriculum architecture for our app

We should not mix everything into one giant tree.

Use a shared foundation, then branch.

### Shared foundation

- instrument setup
- sound production
- seven swaras
- three octaves
- breath, stability, rhythm basics

### Hindustani path

- alankars
- teen taal and basic laya
- thaats
- Bhoopali, Yaman, Brindavani Sarang, Durga, then broader raga progression
- bandish, alaap, taans, tihayi
- embellishments and concert format

### Carnatic path

- sarali / dhatu / jantai / sthayi exercises
- swarasthanas
- alankarams in tala
- geethams
- varnams
- kritis
- gamakas
- manodharma and concert structure

### Fusion / motivation layer

- simple songs
- bhajans
- film songs
- devotional repertoire
- backing tracks

This keeps the learner motivated while the classical depth continues underneath.

## 9. MVP definition

Your most important MVP idea is exactly right: **listen through microphone and classify swara + octave**.

### MVP goal

Help a beginner reliably produce, identify, and stabilize all 7 swaras across 3 octaves with guided progression.

### MVP feature set

- account + profile
- choose Hindustani or Carnatic starting path
- flute scale / tonic setup
- microphone permission + calibration
- real-time note classification for:
  - Sa
  - Re
  - Ga
  - Ma
  - Pa
  - Da
  - Ni
  - across 3 octaves
- note confidence + cents deviation
- noise / unvoiced detection
- sustain scoring
- lesson gating by mastery threshold
- basic swara drills
- basic ascent / descent drills
- basic alankar drills
- tanpura drone
- simple beat trainer
- daily streak and progress dashboard
- premium UI

### MVP pass criteria example

For “Play Madhya Sa”:

- correct swara detected
- correct octave detected
- voiced tone present
- sustain >= target duration
- average cents error within threshold
- stability above threshold

Only then unlock next micro-skill.

## 10. Scoring system we should use

Do not reduce progress to only “right note / wrong note”.

Each attempt should score:

- **Pitch accuracy**: how close to target in cents
- **Octave correctness**: correct register or not
- **Voicing confidence**: tone vs breath/noise
- **Stability**: note wobble during sustain
- **Attack quality**: how cleanly the note starts
- **Duration control**: did the learner hold long enough
- **Timing**: did the note land in time
- **Continuity**: was the phrase broken or smooth

### Simple score formula for MVP

`score = 35% pitch + 20% octave + 20% stability + 15% sustain + 10% noise cleanliness`

Then display:

- overall score
- simple explanation
- one next drill

Example:

- “Good Sa, but airflow is unstable.”
- “Pitch is right, but it dropped flat after 1.2s.”
- “You played Pa instead of Ma.”

## 11. Technical recommendation

### Product stack

- **Frontend**: Next.js + React + TypeScript
- **UI**: Tailwind CSS + a premium component system
- **Motion**: Framer Motion
- **Auth / data / storage**: Supabase
- **PWA**: installable web app with offline lesson caching

### Audio pipeline

- `getUserMedia()` for microphone input
- Web Audio API for stream routing and analysis
- `AudioWorklet` for low-latency frame processing
- feature extraction and pitch estimation in worker/worklet-friendly flow

### Audio / MIR libraries to evaluate

- **Essentia.js** for music/audio analysis in browser, including pitch and onset algorithms
- **Meyda** for lightweight real-time audio features like RMS and spectral measures

### Why this stack fits

- fast to iterate
- works well in browser
- supports real-time interactivity
- easier to build premium UX than a cross-platform native codebase at this stage

## 12. Algorithms we should actually use

### A. Swara and octave classification

1. detect fundamental frequency from microphone frames  
2. map frequency to learner’s configured Sa  
3. convert detected frequency into nearest swara class  
4. determine octave relative to tonic and flute range  
5. output class + confidence

Result:

- 21 core labels in MVP: 7 swaras x 3 octaves

### B. Pitch detection

Recommended approach:

- primary: **probabilistic YIN / pYIN-style pitch tracking**
- secondary smoothing: temporal median / confidence filtering

Why:

- monophonic instrument
- continuous pitch behavior
- better robustness than naive FFT peak picking

### C. Voiced vs noisy tone detection

Use a combination of:

- RMS energy
- harmonicity / pitch confidence
- zero crossing rate
- spectral flatness

This helps us answer:

- did the learner produce an actual flute tone?
- is this mostly air noise?
- is the tone weak or unstable?

### D. Sustain and stability scoring

Measure:

- average cents error
- cents variance over time
- dropouts
- duration above voiced threshold

### E. Rhythm / tala scoring

Use:

- onset detection
- beat grid matching
- timing deviation from expected beat positions

### F. Phrase matching

For alankars and melodies:

- convert performance into swara-time sequence
- compare against target sequence
- use sequence alignment / DTW-style phrase matching

### G. Gamaka scoring - later phase

For Carnatic gamakas and Hindustani meend:

- compare pitch contour shape over time
- reward expressive correctness, not just endpoint note

This is a major differentiator for later versions.

## 13. UX direction - “Apple-like” without becoming generic

The product should feel:

- calm
- spacious
- refined
- focused
- never noisy

### UX principles

- one primary action per screen
- minimal but rich motion
- soft depth, not heavy skeuomorphism
- beautiful waveforms and pitch lines
- warm colors for mastery and feedback
- failure states that feel encouraging, not punishing
- practice-first navigation

### Key screens

- onboarding
- today’s practice
- live tuner / note trainer
- lesson player
- attempt review
- progress map
- riyaz studio
- profile + mastery dashboard

## 14. What makes our product different

This should be our positioning:

> Not just a flute course. Not just a swara tuner.  
> A complete interactive bansuri learning system.

Our moat:

- bansuri-specific listening engine
- structured syllabus across both Hindustani and Carnatic
- progression locked by demonstrated skill
- elegant UX
- adaptive practice system

## 15. Suggested roadmap

### Phase 1 - Foundation MVP

- mic capture
- swara + octave classifier
- tone/noise detection
- sustain trainer
- beginner lessons
- basic progress gating

### Phase 2 - Real learning engine

- alankars
- rhythm scoring
- phrase imitation
- daily riyaz planner
- teacher review upload

### Phase 3 - Classical depth

- ragas
- geethams / bandish
- tala workflows
- gamaka / meend scoring
- song and composition practice

### Phase 4 - Advanced ecosystem

- live classes
- cohort journeys
- certifications
- performance rooms
- AI practice personalization

## 16. Strong recommendation for how we start building

Start with a **web-first PWA focused on Beginner Foundation**.

The first build should solve this loop extremely well:

1. learner sees target note  
2. learner hears target note  
3. learner plays  
4. app classifies swara + octave  
5. app checks voiced tone vs noise  
6. app scores sustain + stability  
7. app explains what to improve  
8. learner repeats until mastery  

If we nail this loop, we have the base for the entire platform.

## 17. Sources

### Existing products

- The Bansuri App: https://play.google.com/store/apps/details?id=com.thebansuriapp
- Divine Bansuri: https://play.google.com/store/apps/details?id=co.jones.bupch
- myGurukul: https://play.google.com/store/apps/details?id=mygurukul.co
- SGS Datta Venu: https://apps.apple.com/in/app/sgs-datta-venu/id6760384421
- Riyaz: https://riyazapp.com/
- Swar Meter: https://play.google.com/store/apps/details?id=org.komal.SwarMeter
- Shruti Carnatic Tuner: https://play.google.com/store/apps/details?id=org.kuyil.shruti
- iSM Circle Bansuri: https://ismcircle.com/learn-bansuri/
- Rhythm with Tabla & Tanpura: https://play.google.com/store/apps/details?id=com.psslabs.rhythm
- Bandish: https://play.google.com/store/apps/details?id=com.pm2877.bandish
- Singtico: https://play.google.com/store/apps/details?id=com.subtlerr.singtico
- SurSadhak: https://play.google.com/store/apps/details?id=com.sursadhak

### Curriculum references

- The Mystic Bamboo intro: https://www.themysticbamboo.com/courses/introductory-course
- The Mystic Bamboo beginner: https://www.themysticbamboo.com/courses/beginner-course
- The Mystic Bamboo intermediate: https://www.themysticbamboo.com/courses/intermediate-course
- The Mystic Bamboo advanced: https://www.themysticbamboo.com/courses/advanced-course
- Acharyanet beginner curriculum: https://www.acharyanet.com/carnatic-beginner-level/
- CarnaticFlute.in beginner level 1: https://carnaticflute.in/beginner-overview/beginner-level-1
- CarnaticFlute.in beginner level 2: https://carnaticflute.in/beginner-overview/beginner-level-2
- CarnaticFlute.in beginner level 3: https://carnaticflute.in/beginner-overview/beginner-level-3
- CarnaticFlute.in intermediate: https://carnaticflute.in/intermediate-overview
- CarnaticFlute.in filmy repertoire: https://carnaticflute.in/filmy-overview
- Udemy Carnatic beginner example: https://www.udemy.com/course/2021-carnatic-flute-basics-beginners-guide/
- Udemy Hindustani beginner example: https://www.udemy.com/course/learn-to-play-flutebansuri-from-scratch/

### YouTube / free-learning ecosystem references

- Classic beginner lesson result referencing basics and song playlists: https://www.youtube.com/watch?v=Bi1tpugX4tI
- Shiv'z Muzic Academy free lessons hub: https://www.shivzmuzic.com/
- Sriharsha Ramkumar learning hub: https://carnaticflute.in/

### Web audio and analysis references

- MDN `MediaDevices`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices
- MDN `getUserMedia()`: https://github.com/mdn/content/blob/main/files/en-us/web/api/mediadevices/getusermedia/index.md?plain=1
- MDN `AnalyserNode`: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- Meyda: https://meyda.js.org/
- Essentia.js: https://mtg.github.io/essentia.js/
- Essentia PitchYinProbabilities: https://essentia.upf.edu/reference/std_PitchYinProbabilities.html
- Essentia PitchYinProbabilistic: https://essentia.upf.edu/reference/std_PitchYinProbabilistic.html
- Essentia PitchMelodia: https://essentia.upf.edu/reference/std_PitchMelodia.html
- Essentia OnsetDetection: https://essentia.upf.edu/documentation/reference/streaming_OnsetDetection.html
