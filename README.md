# Overcast Archipelago

Floating voxel islands in a rainstorm. 

```sh
npm install
npm run dev       # http://localhost:5173  (plain resume at /resume/)
npm run build     # static site in dist/, deploy anywhere 
npm run preview
```

## Editing content

All copy lives in `content/`; no code changes needed.

- `content/site.json`: name, full name, tagline.
- `content/islands.json`: islands (position, footprint, label anchor, props) and bridges (weight 1–3).
- `content/<island>/<item>.md`: one note per file. Front matter feeds the note card, and the body feeds the
  Read note panel. Add a file to add an item; `order` sorts items. Links whose href is still a
  `[PLACEHOLDER]` show as dashed, unclickable buttons until you fill them in.

`/resume/` is generated at build time from the same files, so it never drifts and works without JavaScript.
Drop a `public/resume.pdf` in and the resume page grows a "Download PDF" button automatically.

## Audio

Thunder and rain are synthesized with Web Audio by default. To use recordings instead, add
`public/audio/thunder-1.ogg`, `thunder-2.ogg` and `rain-loop.ogg`, and they're picked up automatically.

Interface cues are synthesized too: each is a short tick plus FM plucks in D major, with a small
room reverb and a limiter. Opening cues rise and closing cues fall. Tune them in `play()` in `src/weather/audio.ts`.

## Layout

```
src/
  main.ts           wires the HTML layer, input, routing; lazy-loads the 3D world
  scene/            camera.ts (fixed iso ortho), voxels.ts (instanced batches), islands.ts, bridges.ts, props/
  weather/          rain.ts (GPU streaks), lightning.ts, lights.ts (glows, smoke, beam, ripples), mist.ts, audio.ts
  ui/               labels.ts, note.ts (note + Read panel), nav.ts, header.ts, router.ts
  content/          load.ts (browser), frontmatter.ts (shared with the build), types.ts
plugins/resume.ts   builds /resume/index.html
```
