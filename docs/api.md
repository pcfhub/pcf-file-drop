---
title: API reference
description: Properties and outputs, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control. A hand-written table is wrong the first time somebody adds a
  property and forgets this file, and a reader has no way to tell.

  kind: input | bound | output | dataset | dataset_column
  Omit `kind` to render every property in one table.
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Outputs

::props-table{kind=output}

## Notes

**File** holds a data URL — `data:<mime>;base64,<payload>` — not bare base64.
That is what lets a canvas `Image` control bind the column directly. It must be
a *multiple lines of text* column; see [Model-driven apps](model-driven.md) for
how long to make it.

**File name** is optional and bound rather than output-only, so the name
survives a reload. A data URL carries the MIME type and not the name, so with
nothing bound the control shows "Unnamed file".

**Accepted types** is the HTML `accept` rule: a comma-separated list of MIME
types (`image/png`), wildcards (`image/*`) or extensions (`.csv`). Empty accepts
anything. It is matched against both the MIME type the browser reports and the
file's extension, so listing both forms is worth doing for types that arrive
without one — a PDF dragged from some file managers has an empty MIME type.

The platform's own picker takes a coarser rule than this:
`PickFileOptions.accept` is exactly `audio`, `video` or `image`. `image/png`
narrows to `image` for that call and `.pdf` narrows to nothing. The full rule is
still applied to whatever comes back.

**Maximum size (KB)** is checked before the file is read, and against the file's
own size rather than the base64 length. Base64 costs about a third more than
the number here.

**Hide preview** is phrased backwards deliberately — a `TwoOptions` input
property generates as `boolean` with no way to express "unset", so `false` is
what a maker who never touched it gets. Phrasing it this way makes that default
the behaviour most people want.
