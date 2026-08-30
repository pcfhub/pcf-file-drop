---
title: Overview
description: What File Drop does, and when to reach for it.
order: 1
---

# File Drop

Drop a file onto a form and keep it in the column.

Drag a file onto the control, or press **Browse**, and the file is written into
the column the control is bound to. Nothing is uploaded anywhere: the file is
read in the browser and stored in the column as a data URL.

::image{src=media/screenshot.png alt="File Drop holding signed-contract.pdf, with Browse and Remove buttons" zoom}

## Why this one

- **It binds a text column, because PCF cannot bind a File column.** The
  manifest schema reference says so under the `type` element — *"At this time
  File columns are not supported"* — and `ImageObject` is documented as
  canvas-only. There is no `of-type="File"` to reach for, and `context.webAPI`
  has five methods, none of which can PATCH a file attribute. So the file lives
  in a `Multiple` column as a data URL, which is the shape Microsoft's own
  ImageUploadControl sample uses.
- **A data URL rather than bare base64**, so a canvas `Image` control can bind
  the same column directly with nothing in between.
- **Three ways in, tried in order.** `context.device.pickFile()` first — on a
  phone that is the camera roll rather than a file dialog — then a hidden file
  input, then dropping onto the control. The fallback is silent, which is why
  `Device.pickFile` is declared as an optional feature rather than a required
  one.

## What it works with

:::callout{type=info}
Model-driven forms and canvas apps both. It reads no column metadata it cannot
do without, publishes no theme of its own, and degrades on any host without a
device bridge — which is every browser tab.

Nothing here is host-specific, including the empty state's icon: it is an inline
`<svg>` drawn in the control's own markup, so it takes its colour from the form's
theme like everything else, and there is no resource to load.
:::

## The ceiling, before you install it

A `Multiple` column holds 1,048,576 characters and base64 costs a third on top,
so **roughly 768 KB is the largest file that will fit** — less if the maker set
the column's own maximum length lower. The **Maximum size (KB)** property
defaults to 512 so that a file is refused up front rather than rejected by the
platform on save, which is a much worse failure: the error arrives after the
file has been read and says nothing about size.

For anything larger, use the out-of-the-box file column control. This one is for
signatures, logos, scanned receipts, small attachments — things measured in
kilobytes.
