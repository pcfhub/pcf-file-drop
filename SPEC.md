# File Drop

Drop a file onto a form and keep it in the column.

## What the build disagreed with

**`showPreview` had to become `hidePreview`.** `refreshTypes` generates
`TwoOptionsProperty`, whose `raw` is typed `boolean` and not `boolean | null` —
so there is no way to tell "the maker set this to false" from "the maker never
touched it", and a property that wants to default to *on* cannot. Inverting the
property is the fix: the platform's own default, `false`, is then the behaviour
most people want. The awkward name is the cost of the only correct default.

This is general rather than specific to this control, and it is the sort of thing
that is discovered twice. Promoted to the skill —
`references/control-patterns.md`, under *Property types*.

## Platform behaviour worth knowing

**PCF cannot bind a File or an Image column.** Read from the manifest schema
reference: the `type` element carries the note "At this time File columns are not
supported", and `ImageObject` is documented as *Available for: Canvas apps*.
There is no `of-type="File"` in the enumeration at all. Combined with
`context.webAPI`'s five methods — none of which can PATCH a file attribute —
there is no supported route from a PCF control to a File column, in either
direction.

The route that does exist is the one Microsoft's own ImageUploadControl sample
takes: base64 in a bound text column. This control stores a full data URL rather
than bare base64, which costs the `data:<mime>;base64,` prefix and buys a value a
canvas `Image` control can bind to with nothing in between.

**`FileObject.fileSize` is in KB.** Read from the FileObject reference, and worth
stating because it is the one field that reads like it means bytes: a size check
written against bytes lets a file a thousand times too large through, and the
failure surfaces as a save error rather than as a refusal.

**An SVG behind `<img src>` cannot be themed by the page, and this control
shipped with that bug.** Observed on a real model-driven form in dark mode,
after the first version drew its empty-state icon as an `<img>` — a `.png`
resource read with `getResource`, falling back to an inline-SVG *data URL*. An
image referenced through `<img>` is rendered as an isolated document: it cannot
see the embedding page's stylesheet, so `stroke="currentColor"` inside it
resolves against its own `color`, which is black. A black document icon on a
near-black form.

The fix is not a different file format. It is to build the icon as an inline
`<svg>` in the control's own DOM, where `currentColor` resolves against the same
CSS custom property every other colour reads and the emblem follows the host's
theme for free. The `<img>` resource and the `getResource` call went with it —
there is nothing left to load.

The tempting non-fix is a resource carrying its own
`@media (prefers-color-scheme: dark)`, which *would* apply inside an `<img>`.
It is the wrong signal for the same reason `applyTheme` does not use it: a
model-driven app carries its own theme and the operating system's setting says
nothing about it, so an OS-dark machine on a light app gets the dark icon.

`context.resources.getResource` is worth one line even though nothing here calls
it now: it is **callback-style**, the only API on `context` that is, so code
written around it in the shape of the rest of the file gets `undefined` and no
error. Promoted to the skill — `references/control-patterns.md`, under *Files
and binary content*.

## Demo

`limited`, and the single limitation is `context.device.pickFile()` rejecting in
the sandbox: there is no device bridge behind that origin. What the visitor sees
when they press Browse is the fallback, which is the same thing a desktop browser
does, so the path is real even though the platform call behind it is not.

Everything else is genuinely interactive, because nothing in this control leaves
the browser: the file is read with `FileReader` and written into the bound
column. No Web API, no navigation, no external service — which is also why
`external-service-usage` is disabled and the control is not premium.

## Not verified

- **The `pending` guard against a write that never round-trips.** While a write
  is in flight the control ignores `parameters.value.raw`, because adopting it
  would drop the file the user just added (the platform renders once with the old
  value before `getOutputs` is read). If a host never hands the value back — a
  column bound read-only, a save that fails — the control stops following the
  column until the form reloads. Observed only against `dev/`; what the platform
  actually does in that window needs a real form.
- **Behaviour above the column's own `MaxLength`.** `maxSizeKb` is checked
  against 512 KB by default, but a maker can raise it past what the column
  accepts, and `parameter.attributes?.MaxLength` is available on model-driven
  hosts only. Whether the platform rejects the write loudly or silently
  truncates has not been observed.
- **Whether `<input type="file">` opens a dialog inside the hub's demo iframe.**
  Sandbox attributes can block it. If it does not, the drop path still works and
  the demo's limitations need a second line.

## Promoting a finding

When something here turns out to be general — true of PCF rather than true of
this control — move it to the skill's `references/control-patterns.md` and
replace it here with a line naming where it went.

Repeating it in both places is how the two drift, and the copy nothing executes
always loses. The rule is: one home, and a pointer from anywhere else.
