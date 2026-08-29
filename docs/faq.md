---
title: FAQ
description: Questions that come up more than once.
order: 8
---

# FAQ

## Why can't I bind it to my File column?

Because no PCF control can. The manifest schema reference says it under the
`type` element — *"At this time File columns are not supported"* — and there is
no `of-type="File"` in the enumeration to declare. Bind a **multiple lines of
text** column instead and see [Model-driven apps](model-driven.md) for how large
to make it.

## Why does it say the file is too large when the column has room?

**Maximum size (KB)** is the control's own limit and defaults to 512. It is
checked before the file is read, deliberately: a file refused after being read
has already been held in memory in full. Raise the property — and raise the
column's maximum length with it, because the control cannot see that number.

## The Browse button opens a normal file dialog. Where is the camera?

You are in a browser. The control asks `context.device.pickFile()` first, which
is what opens the camera roll, and the platform only answers that on the phone
and tablet apps. In a browser tab there is no device bridge, so the call rejects
and the control falls back to the browser's own dialog without saying anything.

Enable the control for **Phone** on the form for the picker to be reachable at
all.

## How do I show the file somewhere else?

The column holds a data URL, so it goes straight into a canvas `Image` control
with no formula:

```powerfx
Image1.Image = ThisItem.cr123_receipt
```

## Why is the property called "Hide preview" instead of "Show preview"?

Because a `TwoOptions` input property has no way to express "unset" — it arrives
as `false` when a maker has never touched it, and there is no telling that from
a deliberate `false`. Phrasing it as *Hide* makes the platform's own default the
behaviour most people want.

## Does it work offline / on mobile / in a phone layout?

Mobile yes, and it is the host the platform picker exists for. Everything the
control does happens in the browser, so it does not need a connection to accept
a file — though saving the record does. See
[Limitations](limitations.md) for what it does not do.

## How do I report a bug?

Open an issue at <https://github.com/pcfhub/pcf-file-drop/issues>, with the
platform version and the control version from the solution.
