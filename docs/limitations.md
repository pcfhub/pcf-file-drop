---
title: Limitations
description: What File Drop does not do.
order: 7
---

# Limitations

- **It cannot use a File or Image column, and no PCF control can.** The manifest
  schema reference states it under the `type` element — *"At this time File
  columns are not supported"* — and `ImageObject` is documented as canvas-only.
  `context.webAPI` offers `create`, `retrieve`, `retrieveMultiple`, `update` and
  `delete`, none of which can PATCH a file attribute. So the file goes into a
  text column as a data URL. If your data model already uses a File column, this
  control is the wrong tool.

- **About 768 KB is the hard ceiling.** A `Multiple` column holds 1,048,576
  characters, base64 costs a third on top, and the `data:…;base64,` prefix a
  little more. **Maximum size (KB)** defaults to 512 to stay clear of it. The
  control does not read the column's own maximum length — that is model-driven
  metadata and absent in canvas — so setting the size limit above what the
  column accepts produces a save error rather than a refusal.

- **One file at a time.** The control binds one column and holds one value.
  `allowMultipleFiles` is passed as `false` to the platform picker, and a drop
  of several files takes the first.

- **Every file is held in memory while it is read**, and again as a base64
  string roughly a third larger. That is fine at these sizes and is another
  reason the ceiling is where it is.

- **The platform picker is not available in a browser tab.** `Device.pickFile`
  needs a device bridge, so on any desktop host the Browse button opens the
  browser's own file dialog instead. This is a fallback rather than a failure and
  nothing is said about it — but it does mean the camera-roll behaviour is
  reachable only from the phone and tablet apps.

- **The empty state's icon may not come from the solution.** It is an `<img>`
  resource read with `context.resources.getResource`, which resolves on a
  model-driven form; elsewhere an inline SVG stands in. The two are drawn to
  look the same, so this is cosmetic.

- **No thumbnailing, compression or conversion.** What is dropped is what is
  stored. A 4 MB photo from a phone camera is refused, not resized.

- **The preview is whatever the browser can render** from a data URL — PNG,
  JPEG, GIF, WebP, SVG. Anything else shows as a name and a size, which is also
  what **Hide preview** forces for images.
