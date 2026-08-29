---
title: Model-driven apps
description: Adding File Drop to a form.
order: 4
---

# Using it on a model-driven form

:::steps
1. Open the form in the modern form designer.
2. Select the **multiple lines of text** column the file will live in.
3. Under **Components → Add component**, choose **File Drop**.
4. Set **File name** to a single-line text column if you want the file's name
   kept. Leave it unbound and the control works, but forgets what the file was
   called.
5. Enable it for **Web**, **Phone** and **Tablet** as appropriate. Phone is
   where the platform picker earns its keep.
6. Save and publish.
:::

## Column types

| Property | Column type |
| --- | --- |
| **File** (required) | Multiple lines of text. Nothing else will hold a data URL. |
| **File name** | Single line of text. |

A single line of text column bound to **File** will appear to work and then
truncate on save: the default maximum is 100 characters and a data URL is
thousands. Set the column's maximum length deliberately — it is the real ceiling,
and **Maximum size (KB)** should be set below it.

:::callout{type=info}
The **Maximum size (KB)** property is the control's own limit and it is checked
before the file is read. It does not know the column's maximum length; the two
are set independently, and setting the size limit above what the column can hold
produces a save error rather than a refusal.
:::

## Sizing the column

| Maximum size (KB) | Column maximum length to allow |
| --- | --- |
| 64 | 90,000 |
| 256 | 350,000 |
| 512 | 700,000 |
| 768 | 1,048,576 (the platform maximum) |

Base64 grows the payload by about a third, and the `data:…;base64,` prefix adds
a few dozen characters on top.
