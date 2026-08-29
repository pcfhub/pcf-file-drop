---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
4. Enable **Code components for canvas apps** if this control is used there.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A Dataverse environment on a currently supported Power Platform version. The
  control uses no preview API and declares no platform library.
- **A `Multiple` (multiple lines of text) column** for the file, with its
  maximum length set high enough for what you intend to store. Base64 costs a
  third on top of the file's own size, so a 500 KB file needs roughly 683,000
  characters.
- Optionally a second **single line of text** column for the file name.

## The one permission you are asked for

The solution declares `Device.pickFile` as an **optional** feature. Granting it
lets the Browse button open the platform's own picker, which on a phone is the
camera roll; refusing it costs nothing, because the control falls back to the
browser's file dialog on every host where the picker is unavailable — which
includes every desktop browser tab.
