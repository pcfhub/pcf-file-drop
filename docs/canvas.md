---
title: Canvas apps
description: Adding File Drop to a canvas app or custom page.
order: 3
---

# Using it in a canvas app

:::steps
1. From **Insert → Get more components**, open the **Code** tab and import
   **File Drop**.
2. Place it from **Insert → Code components**.
3. Bind the properties below.
:::

## Wiring the properties

```powerfx
Set(varFile, "");
Set(varFileName, "");
```

| Property | Value |
| --- | --- |
| File | `varFile` |
| File name | `varFileName` |
| Accepted types | `"image/*"` |
| Maximum size (KB) | `512` |
| Hide preview | `false` |

## Reading the output

The control writes both bound values in one change. Handle it on **OnChange**:

```powerfx
Set(varFile, FileDrop1.value);
Set(varFileName, FileDrop1.fileName)
```

## Showing the file elsewhere

**This is why the column holds a data URL rather than bare base64.** A canvas
`Image` control takes the value straight through, with nothing in between:

```powerfx
Image1.Image = varFile
```

The same value works anywhere canvas accepts an image URL. For a non-image, the
data URL is still a valid `Link` target.

:::callout{type=info}
`Hide preview` reads backwards on purpose. A `TwoOptions` property arrives as
`false` when a maker has not touched it, and there is no way to tell that from a
deliberate `false` — so the property is phrased so that the platform's own
default is the behaviour most people want, which is to show the preview.
:::

## What canvas does not have

`context.device.pickFile()` is available in canvas but rejects in a browser tab,
where there is no device bridge. The control falls back to the browser's own
file dialog without saying anything about it.
