# File Drop

Drop a file onto a form and keep it in the column.

[![Build](https://github.com/pcfhub/pcf-file-drop/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-file-drop/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-file-drop/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-file-drop/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-file-drop), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Gives a form a drop target. Drag a file onto it, or press Browse, and the file
is kept in the column the control is bound to.

**It binds a text column, and that is not a workaround.** PCF cannot bind a File
column at all — the manifest schema reference says so under the `type` element,
"At this time File columns are not supported", and `ImageObject` is documented
as canvas-only. There is no `of-type="File"` to reach for and `context.webAPI`
has five methods, none of which can PATCH a file attribute. So the file lives in
a `Multiple` column as a data URL, which is the shape Microsoft's own
ImageUploadControl sample uses. A data URL rather than bare base64 buys one
concrete thing: a canvas `Image` control can bind the same column directly.

The ceiling that follows is real and worth knowing before installing this. A
`Multiple` column holds 1,048,576 characters, base64 costs a third on top, so
roughly **768 KB is the largest file that fits** — and `maxSizeKb` defaults to
512 so that a maker who never touches it never meets the platform's own error on
save. For anything bigger, use the out-of-the-box file column control; this one
is for signatures, logos, scanned receipts and the like.

Two behaviours look like bugs and are not:

- **The Browse button asks the platform first.** It calls
  `context.device.pickFile()`, which on a phone opens the camera roll rather
  than a file dialog, and falls back to a hidden `<input type="file">` the
  moment that rejects — which it does on every host that is not a real device
  origin. The fallback is silent by design, which is why `Device.pickFile` is
  declared `required="false"` rather than `true`.
- **The preview property is phrased backwards.** It is `hidePreview`, not
  `showPreview`, because a `TwoOptions` input property has no way to express
  "unset": the generated type is `boolean` and a maker who never touches it gets
  `false`. Phrasing it this way makes the platform's default the behaviour most
  people want.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | Multiple | bound, **required** | — | The column the file is kept in, as a data URL |
| `fileName` | SingleLine.Text | bound | — | Optional second column holding the file's name. A data URL carries the MIME type and not the name, so without this the control forgets what the file was called |
| `accept` | SingleLine.Text | input | *(empty — anything)* | Comma-separated MIME types or extensions: `image/*`, `application/pdf`, `.csv` |
| `maxSizeKb` | Whole.None | input | `512` | Files larger than this are refused before they are read |
| `hidePreview` | TwoOptions | input | `false` | Show the file's name instead of a picture, even when the file is an image |

`accept` is the HTML rule and is applied to all three ways in. The platform's
own picker takes a coarser one — `PickFileOptions.accept` is exactly `audio`,
`video` or `image` — so `image/png` narrows to `image` for that call and `.pdf`
narrows to nothing; the full rule is still enforced on what comes back.

Strings ship in five languages: 1033 English, 1031 German, 1036 French, 1041
Japanese, 3082 Spanish. No framework — plain DOM, styled from Fluent's design
tokens with literal fallbacks. One permission is requested at install,
`Device.pickFile`, and it is `required="false"`: the control works without it.

## On the hub

`demo.fidelity` is **`limited`**, and the one limitation is the picker. The
sandbox has no device bridge behind its origin, so `context.device.pickFile()`
rejects there — the control falls back to the file dialog, which is exactly what
it does on a desktop browser, so the *behaviour* on show is real and only that
one path is not.

Everything else is genuinely interactive: dropping a file, browsing for one, the
size refusal, the type refusal, the image preview, and Remove. Nothing in this
control reaches Web API, navigation or Dataverse, so there is nothing else for
the sandbox to stand in for.

The presets cover the empty state, an image with its preview, a non-image shown
as a name and a size, the same image with `hidePreview` set, and a file that is
over the limit.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-file-drop/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or open `dev/harness.html` in a
browser for the switches — field-level security, a failed business rule, a host
that publishes no theme or no column metadata, and for a dataset control, more
than one page. Both read the bundle `npm run build` wrote, and both are
described in the header of `dev/smoke.js`.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `FileDrop/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Tag it: `git tag v1.2.3 && git push --tags`

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `FileDrop/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
