/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/FileDrop/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * Everything above the divider is plumbing that works for any field control.
 * Below it are this control's own decisions — and note that roughly half of
 * them are asynchronous, because a file arrives from a `FileReader` or from
 * `context.device.pickFile()` a turn after the call that asked for it. Those
 * live in `fileChecks()` and the file ends by awaiting it. A suite that
 * asserted on a read without waiting would pass against a control that never
 * finished one.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');

const BUNDLE = path.join(root, 'out', 'controls', 'FileDrop', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/FileDrop. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
const fluent = new Proxy({}, { get: (_target, name) => (typeof name === 'string' ? name : undefined) });

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    const tracked = [];
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, tracked });
    const instance = new registration.ctor();

    let notifications = 0;

    instance.init(context, () => {
        notifications += 1;
    }, {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** `trackContainerResize` / `setFullScreen` calls the control made. */
        tracked: () => tracked,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  What this control decides, and where each decision can go wrong.
 *
 *  A standard control, so every assertion reads the DOM it built. The
 *  interesting half is asynchronous: a file arrives from a `FileReader` or from
 *  the platform's picker, both of which resolve a turn later than the call that
 *  started them. Those live in `fileChecks()` at the bottom, and the file ends
 *  by awaiting it — a suite that asserted on a read without waiting would pass
 *  against a control that never finished one.
 * ======================================================================== */

/** The control's own inputs, at the defaults a fresh instance gets. */
const INPUTS = { fileName: null, accept: '', maxSizeKb: 512, hidePreview: false };

/** A data URL small enough to sit in this file and real enough to render. */
const PNG =
    'data:image/png;base64,'
    + 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR4nGP8z8Dwn4GKgIma'
    + 'hg02AwAr6QP9OFA6bwAAAABJRU5ErkJggg==';

const CSV = `data:text/csv;base64,${Buffer.from('Date,Amount\n2026-08-04,128.40\n').toString('base64')}`;

/** Mount with the control's inputs filled in, so a caller states only the odd one out. */
const drop = (options = {}) => mount({ ...options, inputs: { ...INPUTS, ...(options.inputs || {}) } });

/** A browser `File`, which is what both the drop and the file-input paths carry. */
const fileOf = (name, type, bytes) => new File([Buffer.alloc(bytes, 65)], name, { type });

/** Let a `FileReader` and a `pickFile` promise settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------------------------------------ empty state */

const empty = drop({ value: null });

check(
    'renders a drop zone with a prompt read from the .resx',
    empty.find('.FileDrop-prompt') && empty.find('.FileDrop-prompt').textContent === 'resx:FileDrop_Prompt',
    empty.find('.FileDrop-prompt') && empty.find('.FileDrop-prompt').textContent,
);

check(
    'offers nothing to remove while there is nothing there',
    empty.find('.FileDrop-remove').hidden === true && empty.find('.FileDrop-detail').hidden === true,
);

/*
 * `getResource` is callback-style and its *failure* path is the default one in
 * `dev/host.js`, because an `<img>` resource is documented for model-driven
 * apps and this control runs on more hosts than that. The fallback has to be a
 * picture, not a broken image icon.
 */
check(
    'falls back to an inline icon on a host where getResource fails',
    empty.find('.FileDrop-icon').src.startsWith('data:image/svg+xml,'),
    empty.find('.FileDrop-icon').src.slice(0, 40),
);

const withResource = drop({ value: null, resource: 'QUJD' });

check(
    'and uses the platform resource where it resolves',
    withResource.find('.FileDrop-icon').src === 'data:image/png;base64,QUJD',
    withResource.find('.FileDrop-icon').src,
);

check(
    'asking for it once, not once per render',
    (() => {
        const asked = drop({ value: null, resource: 'QUJD' });

        asked.update({});
        asked.update({});

        return asked.tracked().filter((call) => String(call).startsWith('getResource:')).length === 1;
    })(),
);

/*
 * The empty-state icon is decoration and must not be announced. A screen reader
 * that reads "image" before "Drop a file here" has added a word and no meaning.
 */
check('the empty-state icon is decorative', empty.find('.FileDrop-icon').alt === '');

/* ----------------------------------------------------------- filled state */

const filled = drop({ value: PNG, inputs: { fileName: 'receipt.png' } });

check(
    'shows the name from the second bound column',
    filled.find('.FileDrop-prompt').textContent === 'receipt.png',
    filled.find('.FileDrop-prompt').textContent,
);

check(
    'and previews an image rather than describing it',
    filled.find('.FileDrop-icon').src === PNG
        && filled.find('.FileDrop-icon').classList.contains('FileDrop-icon--preview'),
);

check(
    'a preview is given a real alternative text, unlike the decorative icon',
    filled.find('.FileDrop-icon').alt === 'resx:FileDrop_PreviewAlt',
    filled.find('.FileDrop-icon').alt,
);

/*
 * The name is optional, because the second column is. A data URL carries the
 * MIME type and not the name, so with nothing bound there is genuinely nothing
 * to show — and "" is not it.
 */
check(
    'names an unnamed file rather than showing a blank line',
    drop({ value: PNG }).find('.FileDrop-prompt').textContent === 'resx:FileDrop_Unnamed',
);

check(
    'a file that is not an image is described instead of previewed',
    (() => {
        const document_ = drop({ value: CSV, inputs: { fileName: 'expenses.csv' } });

        return !document_.find('.FileDrop-icon').classList.contains('FileDrop-icon--preview')
            && document_.find('.FileDrop-detail').hidden === false;
    })(),
);

/*
 * **`hidePreview`, not `showPreview`, and this is the assertion that records
 * why.** A `TwoOptions` input property generates as `raw: boolean`, so there is
 * no way to tell "set to false" from "never touched" — and a property that
 * wants to default to *on* cannot. Inverting it makes the platform's own
 * default, `false`, the behaviour most people want.
 */
check(
    'previews by default, because the property is phrased so that false is the good default',
    drop({ value: PNG }).find('.FileDrop-icon').classList.contains('FileDrop-icon--preview'),
);

check(
    'and stops previewing when the maker asks it to',
    !drop({ value: PNG, inputs: { hidePreview: true } })
        .find('.FileDrop-icon')
        .classList.contains('FileDrop-icon--preview'),
);

/*
 * The size is read back out of the value rather than remembered, because
 * nothing remembers it: the column holds a data URL and the control is mounted
 * fresh on every form load. Four base64 characters encode three bytes, so the
 * length alone gives the size without decoding a byte of it.
 */
check(
    'reports a size for a file it never saw arrive',
    drop({ value: CSV }).find('.FileDrop-detail').textContent === 'resx:FileDrop_Size',
    drop({ value: CSV }).find('.FileDrop-detail').textContent,
);

/* ------------------------------------------------------------- the states */

/*
 * The information bug. A user denied read access gets `raw === null`, which is
 * indistinguishable from an empty column unless `security.readable` is checked
 * — so an unchecked control renders an inviting drop zone where the truth is
 * "not allowed to see it".
 */
const denied = drop({ security: 'no-access', value: null });

check(
    'a column the user cannot read says so rather than inviting a drop',
    denied.find('.FileDrop-message').textContent === 'resx:FileDrop_NoAccess'
        && denied.find('.FileDrop-zone').hidden === true,
);

/*
 * Two independent reasons to be read-only, and conflating them is a real bug:
 * the form's `isControlDisabled` and the column's `security.editable`.
 */
check(
    'a read-only column disables both buttons on an editable form',
    drop({ security: 'read-only', value: PNG }).find('.FileDrop-browse').disabled === true
        && drop({ security: 'read-only', value: PNG }).find('.FileDrop-remove').disabled === true,
);

check(
    'and the disabled state reaches the zone, not just the buttons',
    drop({ disabled: true }).container.classList.contains('FileDrop--disabled'),
);

const invalid = drop({ error: true });

check(
    "the platform's own validation message is shown",
    invalid.find('.FileDrop-message').textContent === host.DEFAULTS.errorMessage,
    invalid.find('.FileDrop-message').textContent,
);

/*
 * A canvas app publishes no column metadata and no theme, and every `?.` in the
 * control is about that line.
 */
const canvas = drop({ host: 'canvas' });

check('renders on a host that publishes no column metadata', Boolean(canvas.find('.FileDrop-zone')));

check(
    'takes no position on the theme when the host publishes none',
    !canvas.container.classList.contains('FileDrop--dark'),
    canvas.container.className,
);

check(
    'and follows the host theme where there is one',
    drop({ host: 'model-driven', dark: true }).container.classList.contains('FileDrop--dark'),
);

/* -------------------------------------------------------------- accepting */

/*
 * The size check runs **before** the read, which is the whole reason it is
 * worth asserting: a file refused after being read has already been held in
 * memory in full, and on a phone that is the difference between a refusal and a
 * crash. `notifications() === 0` is what proves nothing was written.
 */
const oversize = drop({ value: null, inputs: { maxSizeKb: 8 }, getString: (key) => (key === 'FileDrop_TooLarge' ? '{0} of {1}' : `resx:${key}`) });

dropFile(oversize, fileOf('huge.png', 'image/png', 40 * 1024));

check(
    'refuses a file over the limit, naming both numbers',
    oversize.find('.FileDrop-message').textContent === '40 of 8',
    oversize.find('.FileDrop-message').textContent,
);

check('and writes nothing to the column', oversize.notifications() === 0);

const wrongType = drop({ value: null, inputs: { accept: 'image/*' } });

dropFile(wrongType, fileOf('notes.txt', 'text/plain', 128));

check(
    'refuses a type the maker excluded',
    wrongType.find('.FileDrop-message').textContent === 'resx:FileDrop_Rejected',
    wrongType.find('.FileDrop-message').textContent,
);

check(
    'and accepts one the rule allows, by extension as well as by MIME type',
    (() => {
        const byExtension = drop({ value: null, inputs: { accept: '.csv' } });

        dropFile(byExtension, fileOf('expenses.csv', '', 64));

        return byExtension.find('.FileDrop-message').hidden === true;
    })(),
);

/*
 * A drop on a disabled control is a drop the form did not permit. Nothing in
 * the DOM stops it — `pointer-events` would also stop the buttons — so the
 * handler has to.
 */
const locked = drop({ value: null, disabled: true });

dropFile(locked, fileOf('a.png', 'image/png', 64));

check('ignores a drop while the form has the control read-only', locked.notifications() === 0);

/* ------------------------------------------------------------ the picker */

/*
 * **The fallback that makes `Device.pickFile` a `required="false"` feature.**
 *
 * `dev/host.js` rejects `pickFile` by default, because every host that is not a
 * real device origin does: `npm start`, the hub's sandbox, a canvas app in a
 * browser tab. The control must not show a failure there — it must open the
 * browser's own dialog instead, silently.
 */
const fallback = drop({ value: null });
let dialogsOpened = 0;

fallback.find('.FileDrop-picker').addEventListener('click', () => {
    dialogsOpened += 1;
});

fallback.find('.FileDrop-browse').click();

/* ---------------------------------------------------- what destroy owes */

/*
 * **Keep this when the assertions above go.** It is written against no
 * particular control and needs no knowledge of what yours takes.
 *
 * `destroy` is the lifecycle method with nothing visible riding on it, so it is
 * the one that quietly does nothing. A control that takes an interval, a
 * `requestAnimationFrame` loop, or a listener on `document` or `window` owes
 * each of them back — and none of the three shows up on a form. On a form
 * somebody leaves open all afternoon, or a subgrid that re-renders its rows,
 * they accumulate.
 */
function teardownChecks() {
    disposeAll();

    const timersBefore = time.pending();
    const listeners = () => Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);
    const listenersBefore = listeners();

    drop({}).destroy();

    check(
        'destroy() releases every timer the control took',
        time.pending() === timersBefore,
        `${timersBefore} → ${time.pending()}`,
    );

    check('and every document-level listener', listeners() === listenersBefore, `${listenersBefore} → ${listeners()}`);

    const rerendered = drop({});
    const afterFirst = time.pending();

    rerendered.update({});
    rerendered.update({});
    rerendered.update({});

    check('and re-rendering does not add another one', time.pending() === afterFirst, `${afterFirst} → ${time.pending()}`);

    disposeAll();
}

/* ------------------------------------------------- everything that awaits */

async function fileChecks() {
    await settle();

    check(
        'a rejected pickFile opens the browser dialog instead, and says nothing about it',
        dialogsOpened === 1 && fallback.find('.FileDrop-message').hidden === true,
        `${dialogsOpened} dialog(s); message: ${fallback.find('.FileDrop-message').textContent}`,
    );

    /*
     * And where it resolves, nothing is read at all: a `FileObject` already
     * carries the base64, so the control assembles the data URL directly.
     */
    const picked = drop({
        value: null,
        pickFile: [{ fileName: 'scan.png', fileSize: 2, mimeType: 'image/png', fileContent: 'QUJD' }],
    });

    picked.find('.FileDrop-browse').click();
    await settle();

    check(
        'a resolved pickFile is committed without a read',
        picked.outputs().value === 'data:image/png;base64,QUJD' && picked.outputs().fileName === 'scan.png',
        JSON.stringify(picked.outputs()),
    );

    /*
     * `PickFileOptions.accept` is not the HTML one: it takes exactly "audio",
     * "video" or "image". Passing `image/png` through unchanged is accepted by
     * the types and understood by nothing.
     */
    check(
        'and is asked for in the vocabulary the platform actually has',
        picked.tracked().some((call) => String(call).includes('"accept":""')),
        picked.tracked().join(' '),
    );

    const narrowed = drop({ value: null, inputs: { accept: 'image/png' }, pickFile: [] });

    narrowed.find('.FileDrop-browse').click();
    await settle();

    check(
        'narrowing image/png to image rather than passing it through',
        narrowed.tracked().some((call) => String(call).includes('"accept":"image"')),
        narrowed.tracked().join(' '),
    );

    /*
     * **`fileSize` is in KB.** It is the one field of a `FileObject` that reads
     * like it means bytes, and a check written against bytes lets a file a
     * thousand times too large straight through — which then fails on save,
     * with an error that says nothing about size.
     */
    const tooBig = drop({
        value: null,
        inputs: { maxSizeKb: 8 },
        pickFile: [{ fileName: 'big.png', fileSize: 40, mimeType: 'image/png', fileContent: 'QUJD' }],
    });

    tooBig.find('.FileDrop-browse').click();
    await settle();

    check(
        'a picked file is measured in KB, as the platform reports it',
        tooBig.notifications() === 0 && tooBig.find('.FileDrop-message').hidden === false,
        `${tooBig.notifications()} write(s)`,
    );

    /* ------------------------------------------------------------ reading */

    const read = drop({ value: null });

    dropFile(read, fileOf('note.txt', 'text/plain', 32));
    await settle();

    check(
        'a dropped file is read into the column as a data URL',
        String(read.outputs().value).startsWith('data:text/plain;base64,'),
        String(read.outputs().value).slice(0, 32),
    );

    check(
        'and its name goes to the second column, in the same single notification',
        read.outputs().fileName === 'note.txt' && read.notifications() === 1,
        `${read.notifications()} notification(s)`,
    );

    /*
     * **The assertion this control exists to keep.**
     *
     * The platform renders once with the *old* `raw` between
     * `notifyOutputChanged` and `getOutputs` being read. The usual guard —
     * adopt `raw` whenever it differs from what is held — adopts the empty
     * column back over the file that was just added, and the file vanishes a
     * frame after it appeared. Nothing about that is visible in a rendered form
     * until somebody drops a file and watches it disappear.
     */
    const written = String(read.outputs().value);

    read.update({ value: null });

    check(
        'a render carrying the value the platform has not caught up with does not drop the file',
        String(read.outputs().value) === written,
        read.outputs().value === null ? 'the file was dropped' : 'held',
    );

    read.update({ value: written });
    read.update({ value: null });

    check(
        'and it does follow the column again once the write has landed',
        read.outputs().value === null,
        String(read.outputs().value).slice(0, 24),
    );

    /* ------------------------------------------------------------ removing */

    const removing = drop({ value: PNG, inputs: { fileName: 'receipt.png' } });

    removing.find('.FileDrop-remove').click();

    check(
        'Remove clears both columns with a value the platform can act on',
        removing.outputs().value === null && removing.outputs().fileName === null,
        JSON.stringify(removing.outputs()),
    );

    /*
     * `null` clears a column; `undefined` means "no change". The generated
     * `IOutputs` types both as optional, so `?? undefined` type-checks and
     * turns every clear into a no-op — canvas honours that strictly, and
     * `pcf-star-rating` shipped exactly this with a clear button that did
     * nothing.
     */
    check(
        'and that value is null rather than "no change"',
        removing.outputs().value !== undefined && removing.outputs().fileName !== undefined,
        `getOutputs() returned ${JSON.stringify(removing.outputs())}`,
    );

    /*
     * A read still in flight when the platform throws the control away calls
     * back against a container that is no longer on the page. On a form
     * somebody is navigating between records, that is every navigation.
     */
    const abandoned = drop({ value: null });

    dropFile(abandoned, fileOf('slow.txt', 'text/plain', 32));
    abandoned.destroy();

    await settle();

    check(
        'destroy() abandons a read still in flight rather than letting it land',
        abandoned.notifications() === 0,
        `${abandoned.notifications()} write(s) after destroy`,
    );
}

/*
 * Hidden is a state, not an absence. Canvas relies on `mode.isVisible` — a
 * model-driven form hides the section itself — and a control that ignores it
 * stays on screen in a canvas app that asked for it to go.
 */
check(
    'renders nothing visible when the host says it is hidden',
    drop({ visible: false }).container.classList.contains('FileDrop--hidden'),
);

/*
 * The resize contract. This control lays out in one column at every width and
 * asks for nothing, so all this honestly asserts is that a phone-sized
 * container does not break it.
 */
check('renders in a phone-sized container', Boolean(drop({ width: 320, formFactor: 'phone' }).find('.FileDrop-zone')));

fileChecks().then(() => {
    teardownChecks();
    report();
});

/** Drop a file onto the zone, the way a browser delivers one. */
function dropFile(handle, file) {
    const zone = handle.find('.FileDrop-zone');

    zone.dispatchEvent({
        type: 'drop',
        target: zone,
        preventDefault: () => {},
        dataTransfer: { files: [file] },
    });
}

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
