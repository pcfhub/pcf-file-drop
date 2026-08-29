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

**`context.resources.getResource` is callback-style.** It is the only API on
`context` that is — everything else asynchronous returns a promise — so code
written around it in the shape of the rest of the file gets `undefined` and no
error.

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

- **Whether an `<img>` resource resolves in a canvas app.** The manifest schema
  reference lists `code` as supported on both hosts while noting that its `html`
  and `img` properties are not supported in canvas, which is about the `code`
  element rather than about the `img` *resource* — the wording does not settle
  it. The control falls back to an inline SVG when `getResource` fails, so the
  outcome is cosmetic either way, but the claim is untested. Proving it needs the
  control on a canvas app with the placeholder path instrumented.
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
