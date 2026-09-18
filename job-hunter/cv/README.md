# CV kit

Renders the designed one-page CV from an HTML template into an A4 PDF. The
template is the source of truth: the PDF is disposable, regenerate it after every
edit.

```sh
npm install          # once — pulls the Manrope webfont
npm run build        # -> out/CV.pdf
npm run build -- cv-template.html -o out/Vladyslav_Domotskyi_CV_photo.pdf
```

`npm run build` goes through `tsx` so the fact-guard check can import
`@jobhunter/core`. `npm run build:plain` runs on bare `node` — same PDF, no
fact-guard.

## What the build does

1. Inlines the four Manrope weights and `photo.jpg` as base64, so the PDF carries
   its own fonts and image and renders identically anywhere.
2. Prints the page at exactly 210×297mm with no margins.
3. Reports overflow past one A4 page. A CV that silently spills onto a second page
   is worse than one that is a line shorter, so treat a warning here as a failure.
4. Runs the fact-guard from `@jobhunter/core` over the rendered text, verifying
   every claim against `../data/profile.seed.json` — language levels, numbers, and
   the CV's structural claims. A non-zero exit means the template now asserts
   something the profile does not support.

## Editing

Open `cv-template.html` in any editor. It is plain HTML and CSS in millimetres:
`aside` is the dark sidebar, `main` is the content column. The placeholders
`{{F400}}`, `{{F600}}`, `{{F700}}`, `{{F800}}` and `{{PHOTO}}` are filled by the
build — leave them alone.

To keep it on one page, the levers in order of effect are `body { font-size }`,
`main { gap }`, and `body { line-height }`. Rebuild after each change and read the
overflow line.

If a change introduces a new claim — a tool, a duration, a language level — add it
to `../data/profile.seed.json` first, or the fact-guard will reject it. That
ordering is the point: the profile is what the whole system treats as true, and
the CV is a view of it.

## Files not in this repository

The repository is public, so three things stay local and are gitignored:

| File | What it is |
| --- | --- |
| `cv-template.html` | the filled template — carries phone number and address |
| `photo.jpg` | the portrait, 578×787, cropped from the German CV |
| `out/` | rendered PDFs |

Without them `npm run build` exits with `missing template` or `missing photo`.
They are delivered separately; keep a copy outside this checkout.
