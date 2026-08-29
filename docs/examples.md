---
title: Examples
description: Worked configurations of File Drop.
order: 6
---

# Examples

## A signature on a work order

The goal: a technician draws or photographs a signature on a phone, and it stays
with the record. Small, always an image, and it should preview.

| Property | Value |
| --- | --- |
| File | `cr123_signature` (multiple lines of text, maximum length 350,000) |
| File name | *(unbound — a signature has no name worth keeping)* |
| Accepted types | `image/*` |
| Maximum size (KB) | `256` |
| Hide preview | `false` |

Enable the control for **Phone** as well as **Web**. That is what makes the
Browse button open the camera roll rather than a file dialog — the control asks
`context.device.pickFile()` first, and the platform only answers on a device.

## A receipt on an expense line

The goal: a receipt of any kind, image or PDF, with the original file name kept
so a reviewer can recognise it.

| Property | Value |
| --- | --- |
| File | `cr123_receipt` (multiple lines of text, maximum length 700,000) |
| File name | `cr123_receiptname` (single line of text) |
| Accepted types | `image/*,application/pdf,.pdf` |
| Maximum size (KB) | `512` |
| Hide preview | `false` |

Both `application/pdf` and `.pdf` are listed on purpose: the rule is matched
against the MIME type the browser reports *and* the file's extension, and a PDF
dragged from some file managers arrives with an empty type.

A PDF is not an image, so the control shows the name and size rather than a
preview — there is nothing an `<img>` can do with it.

## The same column, shown in a canvas app

```powerfx
Image1.Image = ThisItem.cr123_receipt
```

No conversion and no formula. That is the whole reason the column holds a data
URL rather than bare base64.

:::callout{type=success}
Set **Maximum size (KB)** below what the column can hold, not at it. The control
refuses a file up front and says why; the platform rejects an over-long value on
save, with an error that never mentions size.
:::
