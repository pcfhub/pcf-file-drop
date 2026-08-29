import { IInputs, IOutputs } from './generated/ManifestTypes';

/**
 * The ceiling the column imposes, minus room to be wrong about it.
 *
 * A `Multiple` column holds 1,048,576 characters and base64 costs a third on
 * top, so ~768 KB is the true maximum. 512 is the default because a maker who
 * never touches this property should never meet the platform's own error on
 * save, which arrives after the file has been read and says nothing about size.
 */
const DEFAULT_MAX_SIZE_KB = 512;

/**
 * A file kept in a text column, as a data URL.
 *
 * **Read the manifest before this file.** The one design decision worth
 * understanding is recorded there: PCF cannot bind a File or an Image column,
 * so the file lives in a `Multiple` column as a data URL — the same shape
 * Microsoft's own ImageUploadControl sample uses. Everything below follows from
 * that.
 *
 * There are three ways to get a file in, and they are tried in that order:
 *
 *   1. `context.device.pickFile()` — the platform's own picker, which on a
 *      phone is the camera roll rather than a file dialog.
 *   2. A hidden `<input type="file">`, for when it rejects.
 *   3. Dropping onto the control, which works wherever the other two do.
 *
 * The fallback is what makes `Device.pickFile` a `required="false"` feature.
 * The picker rejects on every host that is not a real device origin — `npm
 * start`, the hub's demo sandbox, a canvas app in a browser tab — so a control
 * that treated the rejection as an error would show a failure to most of the
 * people who ever run it. Here the rejection is not even visible: the file
 * dialog opens instead.
 */
export class FileDrop implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private container!: HTMLDivElement;
    private zone!: HTMLDivElement;
    /**
     * The document emblem, as an inline `<svg>` in this control's own DOM.
     *
     * **Inline is the whole point, and an `<img>` cannot do this job.** An SVG
     * referenced through `<img src>` — file or data URL alike — is rendered as
     * an isolated document: it cannot see this page's stylesheet, so a
     * `stroke="currentColor"` inside it resolves against its own `color`, which
     * is black. On a dark form that is a black icon on a dark background.
     *
     * The only way an `<img>`-loaded SVG could theme itself is its own
     * `@media (prefers-color-scheme: dark)`, and that is the wrong signal —
     * a model-driven app carries its own theme and the operating system's
     * setting says nothing about it, which is the same reason `applyTheme`
     * below reads `fluentDesignLanguage` instead. Inline, `currentColor`
     * resolves against the CSS custom property every other colour here uses,
     * and the emblem follows the host for free.
     */
    private emblem!: SVGSVGElement;
    /** Only ever the file itself. The emblem above covers every other state. */
    private preview!: HTMLImageElement;
    private prompt!: HTMLParagraphElement;
    private detail!: HTMLParagraphElement;
    private actions!: HTMLDivElement;
    private browse!: HTMLButtonElement;
    private remove!: HTMLButtonElement;
    private picker!: HTMLInputElement;
    private message!: HTMLParagraphElement;

    private notifyOutputChanged!: () => void;

    /**
     * The most recent context, kept so that a callback can re-render.
     *
     * A file arrives asynchronously — from a `FileReader`, or from the
     * platform's picker — which is long after the `updateView` that started it
     * returned. Re-reading `context` there is not an option and re-rendering is
     * the only way the preview appears, so the last one is held. It is replaced
     * on every pass, and every use of it happens between two of them.
     */
    private context!: ComponentFramework.Context<IInputs>;

    /** The data URL in the column, or `null` for an empty column. */
    private value: string | null = null;
    /** The file's name, when a second column was bound to hold it. */
    private name: string | null = null;

    /**
     * What was handed to the platform and not yet handed back.
     *
     * Without this the control drops the file the user just added. The sequence
     * is: commit → `notifyOutputChanged` → the platform reads `getOutputs` →
     * `updateView`. Any render in that window carries the *old* `raw`, and the
     * usual guard — adopt `raw` whenever it differs from what is held — adopts
     * the empty column back over a file that was added a moment ago.
     *
     * So while a write is in flight, `raw` is ignored. The trade is that a
     * change made elsewhere during that window is ignored too, and if the write
     * never round-trips at all — a column the maker bound read-only — this
     * control stops following the column until the form reloads. That is the
     * lesser of the two failures by a wide margin, and it is named in SPEC.md.
     *
     * **It is a box rather than a bare `string | null`**, because clearing the
     * column is itself a write worth waiting on: with `null` doing double duty
     * as both "nothing in flight" and "a clear in flight", pressing Remove set
     * the guard to the value that switches it off, the very next render adopted
     * the old file back out of `raw`, and the button did nothing at all. Caught
     * by `dev/smoke.js`, which is what it is for.
     */
    private pending: { value: string | null } | null = null;

    /** A refusal or a failure to report, cleared by the next attempt. */
    private notice = '';

    /** The read in flight, which `destroy()` owes an `abort()`. */
    private reader: FileReader | null = null;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        _state: ComponentFramework.Dictionary,
        container: HTMLDivElement,
    ): void {
        this.container = container;
        this.context = context;
        this.notifyOutputChanged = notifyOutputChanged;

        this.emblem = documentEmblem();

        this.preview = document.createElement('img');
        this.preview.className = 'FileDrop-preview';

        this.prompt = document.createElement('p');
        this.prompt.className = 'FileDrop-prompt';

        this.detail = document.createElement('p');
        this.detail.className = 'FileDrop-detail';

        this.browse = document.createElement('button');
        this.browse.className = 'FileDrop-browse';
        this.browse.type = 'button';
        this.browse.addEventListener('click', this.onBrowse);

        this.remove = document.createElement('button');
        this.remove.className = 'FileDrop-remove';
        this.remove.type = 'button';
        this.remove.addEventListener('click', this.onRemove);

        /*
         * Never focusable and never announced. The Browse button is the control
         * a keyboard user operates; this is the mechanism behind it, and a file
         * input left in the tab order is a second, unlabelled stop that opens
         * the same dialog.
         */
        this.picker = document.createElement('input');
        this.picker.className = 'FileDrop-picker';
        this.picker.type = 'file';
        this.picker.tabIndex = -1;
        this.picker.setAttribute('aria-hidden', 'true');
        this.picker.addEventListener('change', this.onPicked);

        // The two buttons sit in a row of their own. Left as direct children of
        // the zone they inherit its column direction and stack, which reads as
        // two unrelated controls rather than one pair.
        this.actions = document.createElement('div');
        this.actions.className = 'FileDrop-actions';
        this.actions.append(this.browse, this.remove);

        this.zone = document.createElement('div');
        this.zone.className = 'FileDrop-zone';
        this.zone.append(this.emblem, this.preview, this.prompt, this.detail, this.actions, this.picker);

        /*
         * `dragover` must call `preventDefault()` or `drop` never fires at all.
         *
         * It is the single most common reason a drop target does nothing, and
         * it fails silently: the cursor shows "no entry", the handler below is
         * never called, and there is nothing in the console to read. The
         * default action being prevented is the browser's own "navigate to this
         * file", which is what would otherwise happen.
         */
        this.zone.addEventListener('dragover', this.onDragOver);
        this.zone.addEventListener('dragleave', this.onDragLeave);
        this.zone.addEventListener('drop', this.onDrop);

        // The platform's own validation message, and this control's refusals,
        // share one line. Polite rather than assertive: a refused file is not
        // an interruption, and the user is still on the control that caused it.
        this.message = document.createElement('p');
        this.message.className = 'FileDrop-message';
        this.message.setAttribute('aria-live', 'polite');

        this.container.classList.add('FileDrop');
        this.container.append(this.zone, this.message);

        this.render(context);
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        this.context = context;
        this.render(context);
    }

    public getOutputs(): IOutputs {
        // `null` clears a column; `undefined` means "no change". The generated
        // IOutputs types both of these as `string | undefined`, so the obvious
        // `?? undefined` type-checks and turns every Remove into a no-op —
        // canvas honours that strictly, and the file will not clear. The cast
        // is the fix rather than a workaround; `pcf-star-rating` carries the
        // same one for the same reason.
        return {
            value: this.value === null ? (null as unknown as undefined) : this.value,
            fileName: this.name === null ? (null as unknown as undefined) : this.name,
        };
    }

    public destroy(): void {
        this.browse.removeEventListener('click', this.onBrowse);
        this.remove.removeEventListener('click', this.onRemove);
        this.picker.removeEventListener('change', this.onPicked);
        this.zone.removeEventListener('dragover', this.onDragOver);
        this.zone.removeEventListener('dragleave', this.onDragLeave);
        this.zone.removeEventListener('drop', this.onDrop);

        /*
         * The half that is easy to forget, because nothing visible depends on
         * it. A read still in flight calls back against a control the platform
         * has already thrown away and writes into a container that is no longer
         * on the page — and on a form the user is navigating between records,
         * that happens on every navigation.
         */
        this.reader?.abort();
        this.reader = null;
    }

    private render(context: ComponentFramework.Context<IInputs>): void {
        const parameter = context.parameters.value;

        // Before the visibility guard, so the no-access message is themed too.
        this.applyTheme(context);

        // Canvas relies on this; a model-driven form hides the section itself.
        this.container.classList.toggle('FileDrop--hidden', !context.mode.isVisible);

        if (!context.mode.isVisible) {
            return;
        }

        // Field-level security is NOT the form's read-only state. A user denied
        // read access gets `raw === null`, which is indistinguishable from an
        // empty column unless `security.readable` is checked — so an unchecked
        // control renders "no file" where the truth is "not allowed to see it".
        const security = parameter.security;

        if (security !== undefined && !security.readable) {
            this.zone.hidden = true;
            this.message.hidden = false;
            this.message.textContent = context.resources.getString('FileDrop_NoAccess');

            return;
        }

        this.zone.hidden = false;
        this.adopt(context);

        const disabled =
            context.mode.isControlDisabled || (security !== undefined && !security.editable);

        this.browse.disabled = disabled;
        this.remove.disabled = disabled;
        this.container.classList.toggle('FileDrop--disabled', disabled);

        this.picker.accept = context.parameters.accept.raw ?? '';

        this.browse.textContent = context.resources.getString('FileDrop_Browse');
        this.remove.textContent = context.resources.getString('FileDrop_Remove');

        this.paint(context);

        // `mode.label` is the label the maker gave the field on this form,
        // which is a better accessible name than anything shipped in the .resx.
        this.zone.setAttribute('role', 'group');
        this.zone.setAttribute(
            'aria-label',
            context.mode.label || context.resources.getString('FileDrop_Name'),
        );

        this.container.dir = context.userSettings.isRTL ? 'rtl' : 'ltr';
        this.container.classList.toggle('FileDrop--invalid', parameter.error);

        /*
         * This control's own refusal outranks the platform's message, and the
         * order is deliberate: the notice is about what the user just tried,
         * the platform's error is about what is already in the column. Showing
         * the older of the two is how a user learns nothing from either.
         */
        const text = this.notice || (parameter.error ? parameter.errorMessage : '');

        this.message.hidden = text === '';
        this.message.textContent = text;
    }

    /**
     * Take the column's value, unless a write of our own is still in flight.
     *
     * See `pending` above for why the usual unconditional guard loses files.
     */
    private adopt(context: ComponentFramework.Context<IInputs>): void {
        const incoming = context.parameters.value.raw || null;

        if (this.pending !== null) {
            if (incoming === this.pending.value) {
                this.pending = null;
            }

            return;
        }

        if (incoming !== this.value) {
            this.value = incoming;
            this.notice = '';
        }

        this.name = context.parameters.fileName.raw || null;
    }

    /** Fill the zone for whichever of the two states the column is in. */
    private paint(context: ComponentFramework.Context<IInputs>): void {
        const strings = context.resources;

        if (this.value === null) {
            this.showEmblem();
            this.prompt.textContent = strings.getString('FileDrop_Prompt');
            this.detail.hidden = true;
            this.remove.hidden = true;
            this.container.classList.remove('FileDrop--filled');

            return;
        }

        const label = this.name || strings.getString('FileDrop_Unnamed');

        /*
         * `hidePreview` rather than `showPreview`, and the awkward name is the
         * point. A `TwoOptions` input property has no way to say "unset": the
         * generated type is `boolean`, and a maker who never touches it gets
         * `false`. So the property is phrased so that the value the platform
         * hands over by default is the behaviour most people want — a preview.
         * Phrased the other way round, every fresh instance would show a file
         * chip where a picture belongs, and the fix would be a checkbox nobody
         * knew to look for.
         */
        const preview = !context.parameters.hidePreview.raw && isImage(this.value);

        if (preview) {
            this.preview.src = this.value;
            this.preview.alt = strings.getString('FileDrop_PreviewAlt').replace('{0}', label);
            this.showPreview();
        } else {
            this.showEmblem();
        }

        this.prompt.textContent = label;
        this.detail.hidden = false;
        this.detail.textContent = strings.getString('FileDrop_Size').replace('{0}', String(sizeInKb(this.value)));

        this.remove.hidden = false;
        this.remove.setAttribute('aria-label', `${strings.getString('FileDrop_Remove')} ${label}`);
        this.container.classList.add('FileDrop--filled');
    }

    /*
     * The two are mutually exclusive, and they are hidden by different means
     * for one dull reason: `hidden` is an HTMLElement *property*, and an inline
     * `<svg>` is an SVGElement, which does not have it. The *attribute* works on
     * both — `[hidden]` is a plain attribute selector — so the emblem goes
     * through `setAttribute`. Both are backed by the same `[hidden]` rules in
     * the stylesheet, which the element's own `display` would otherwise outrank.
     */
    private showEmblem(): void {
        this.emblem.removeAttribute('hidden');
        this.preview.hidden = true;
    }

    private showPreview(): void {
        this.emblem.setAttribute('hidden', '');
        this.preview.hidden = false;
    }

    /**
     * Ask the platform for a file, and fall back to the browser's own dialog.
     *
     * The order matters on a phone, where `pickFile` opens the camera roll and
     * a bare file input opens something far less useful.
     */
    private onBrowse = (): void => {
        const context = this.context;
        const accept = context.parameters.accept.raw ?? '';
        const maxSizeKb = context.parameters.maxSizeKb.raw ?? DEFAULT_MAX_SIZE_KB;

        let picking: Promise<ComponentFramework.FileObject[]>;

        try {
            picking = context.device.pickFile({
                /*
                 * The platform's `accept` is not the HTML one: it takes exactly
                 * "audio", "video" or "image" and nothing else. Anything more
                 * specific than that survives only on the input element below.
                 */
                accept: kindOf(accept),
                allowMultipleFiles: false,
                maximumAllowedFileSize: maxSizeKb * 1024,
            });
        } catch {
            // Not every host even defines `device`, and a throw here is not a
            // rejection — it never reaches the `catch` on the promise.
            this.picker.click();

            return;
        }

        picking.then(
            (files) => {
                const file = files?.[0];

                if (!file) {
                    // The picker opened and the user chose nothing. Not a
                    // failure, and nothing to say about it.
                    return;
                }

                if (!accepts(accept, file.fileName, file.mimeType)) {
                    this.refuse(context.resources.getString('FileDrop_Rejected'));

                    return;
                }

                // `fileSize` is in KB, which is the one field of a FileObject
                // that reads like it means bytes. A check written against bytes
                // lets a file a thousand times too large straight through.
                if (file.fileSize > maxSizeKb) {
                    this.tooLarge(file.fileSize, maxSizeKb);

                    return;
                }

                this.commit(`data:${file.mimeType};base64,${file.fileContent}`, file.fileName);
            },
            () => {
                /*
                 * The expected outcome nearly everywhere, and deliberately
                 * invisible: no message, no console noise, just the browser's
                 * own dialog instead. `pcf-barcode-scanner` names its rejection
                 * because it has nothing to fall back to; this one does.
                 */
                this.picker.click();
            },
        );
    };

    private onPicked = (): void => {
        const file = this.picker.files?.[0];

        if (file) {
            this.accept(file);
        }

        /*
         * Cleared so that choosing the same file twice in a row still fires
         * `change`. Without it the second attempt does nothing at all, which
         * reads as the control having broken.
         */
        this.picker.value = '';
    };

    private onDragOver = (event: DragEvent): void => {
        // See the comment where this is attached: without preventDefault there
        // is no drop event at all.
        event.preventDefault();
        this.container.classList.add('FileDrop--over');
    };

    private onDragLeave = (): void => {
        this.container.classList.remove('FileDrop--over');
    };

    private onDrop = (event: DragEvent): void => {
        event.preventDefault();
        this.container.classList.remove('FileDrop--over');

        if (this.browse.disabled) {
            return;
        }

        const file = event.dataTransfer?.files?.[0];

        if (file) {
            this.accept(file);
        }
    };

    private onRemove = (): void => {
        this.commit(null, null);
    };

    /** Check a browser `File`, then read it. */
    private accept(file: File): void {
        const context = this.context;
        const rule = context.parameters.accept.raw ?? '';
        const maxSizeKb = context.parameters.maxSizeKb.raw ?? DEFAULT_MAX_SIZE_KB;

        if (!accepts(rule, file.name, file.type)) {
            this.refuse(context.resources.getString('FileDrop_Rejected'));

            return;
        }

        // Bytes here, KB on a FileObject. Checked before the read rather than
        // after, so a file far too large is never held in memory at all.
        const sizeKb = Math.ceil(file.size / 1024);

        if (sizeKb > maxSizeKb) {
            this.tooLarge(sizeKb, maxSizeKb);

            return;
        }

        // A read already running is abandoned rather than raced. Two files
        // dropped in quick succession otherwise finish in whichever order the
        // browser chooses, and the column keeps the first one.
        this.reader?.abort();

        const reader = new FileReader();

        this.reader = reader;

        reader.onload = () => {
            this.reader = null;
            this.commit(typeof reader.result === 'string' ? reader.result : null, file.name);
        };

        reader.onerror = () => {
            this.reader = null;
            this.refuse(context.resources.getString('FileDrop_Unreadable'));
        };

        reader.readAsDataURL(file);
    }

    private commit(value: string | null, name: string | null): void {
        this.value = value;
        this.name = name;
        this.pending = { value };
        this.notice = '';

        this.notifyOutputChanged();
        this.render(this.context);
    }

    private tooLarge(sizeKb: number, maxSizeKb: number): void {
        this.refuse(
            this.context.resources
                .getString('FileDrop_TooLarge')
                .replace('{0}', String(sizeKb))
                .replace('{1}', String(maxSizeKb)),
        );
    }

    private refuse(text: string): void {
        this.notice = text;
        this.render(this.context);
    }

    /**
     * Picks which set of colour fallbacks the stylesheet uses.
     *
     * Only the fallbacks. Where the host publishes Fluent's design tokens — a
     * model-driven form does, via the `FluentProvider` it already mounts above
     * every code component — the CSS reads them straight through `var()` and
     * this changes nothing.
     *
     * `@media (prefers-color-scheme: dark)` is the obvious hook and it is the
     * wrong question: a model-driven app carries its own theme and the user's
     * OS setting says nothing about it. Absent means absent — no class, light
     * fallbacks, the same guess the host made by not saying.
     */
    private applyTheme(context: ComponentFramework.Context<IInputs>): void {
        const isDarkTheme = context.fluentDesignLanguage?.isDarkTheme;

        if (isDarkTheme === undefined) {
            return;
        }

        this.container.classList.toggle('FileDrop--dark', isDarkTheme);
    }
}

/** Whether the data URL in the column is something an `<img>` can show. */
function isImage(dataUrl: string): boolean {
    return /^data:image\//.test(dataUrl);
}

/**
 * How large the column's value is, in KB, from the base64 payload alone.
 *
 * Four base64 characters encode three bytes, and the trailing `=` padding
 * encodes nothing — so the length alone gives the size without decoding a
 * single byte of it.
 */
function sizeInKb(dataUrl: string): number {
    const payload = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;

    return Math.max(1, Math.round(((payload.length * 3) / 4 - padding) / 1024));
}

/**
 * The `accept` value the platform's picker understands, out of an HTML one.
 *
 * `PickFileOptions.accept` takes "audio", "video" or "image" and nothing else,
 * so `image/png` narrows to `image` and `.pdf` narrows to nothing at all. The
 * file input keeps the full rule; this is the coarse version for the platform.
 */
function kindOf(accept: string): string {
    const match = /(audio|video|image)/.exec(accept.toLowerCase());

    return match ? match[1] : '';
}

/** Whether a file matches the maker's `accept` rule. Empty accepts anything. */
function accepts(accept: string, fileName: string, mimeType: string): boolean {
    const rules = accept
        .split(',')
        .map((rule) => rule.trim().toLowerCase())
        .filter((rule) => rule !== '');

    if (rules.length === 0) {
        return true;
    }

    const name = (fileName || '').toLowerCase();
    const type = (mimeType || '').toLowerCase();

    return rules.some((rule) => {
        if (rule.startsWith('.')) {
            return name.endsWith(rule);
        }

        if (rule.endsWith('/*')) {
            return type.startsWith(rule.slice(0, -1));
        }

        return type === rule;
    });
}

/** The SVG namespace. `createElement` produces an HTML element of the same name,
 *  which renders nothing at all — the failure is silent and looks like CSS. */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A page with a folded corner: 48×48 on a 2px stroke, matching Fluent's line icons. */
const EMBLEM_PATHS = [
    'M28 6H12a2 2 0 0 0-2 2v32a2 2 0 0 0 2 2h24a2 2 0 0 0 2-2V16z',
    'M28 6v10h10',
];

/**
 * The document emblem, built as real elements rather than as a data URL.
 *
 * `stroke="currentColor"` is the reason for all of this: inline, it resolves
 * against the `color` the stylesheet sets from the same custom property every
 * other colour in the control reads, so the emblem follows the host's light and
 * dark themes with no code. Through `<img src>` it would resolve inside an
 * isolated document and come out black.
 *
 * Built with `createElementNS` because `createElement('svg')` makes an
 * *HTML* element named "svg" — it parses, it appends, it occupies no space and
 * draws nothing, which reads as a CSS problem for as long as you let it.
 *
 * Decorative: the empty state has its prompt and the filled state has the file
 * name, so there is nothing here a screen reader should announce.
 */
function documentEmblem(): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;

    // `classList` rather than `className`: on an SVG element `className` is a
    // read-only SVGAnimatedString, and assigning to it silently does nothing.
    svg.classList.add('FileDrop-emblem');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('aria-hidden', 'true');
    // Legacy Edge put SVG in the tab order without this. It costs one attribute.
    svg.setAttribute('focusable', 'false');

    for (const d of EMBLEM_PATHS) {
        const path = document.createElementNS(SVG_NS, 'path');

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');

        svg.appendChild(path);
    }

    return svg;
}
