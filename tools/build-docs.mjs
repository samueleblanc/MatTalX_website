/*
    Builds docs/index.html from the conversion engine itself.

    The documentation used to be a PDF, which meant every symbol lived inside a file that
    could not be searched and that Google could not read. Generating the page from
    core.js instead puts each command and the character it gives on the page as text, so
    the list cannot drift from what the extension does, and a new release is one
    `npm run docs` away.

    The sections are the comments core.js already carries inside mathDictionary, so the
    page is organised the way the code is. What a command gives is taken from
    completion.js, so the documentation and the suggestion box cannot disagree.

    Run: npm run docs
*/

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { dictionaries, spaceCommand } from "../js/core.js";
import { everyCommand } from "../js/completion.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const VERSION = "3.0.0";

/* ---------- what a command gives, straight from the suggestion box ---------- */

const labels = new Map();
for (const { insert, label } of everyCommand([], true)) {
    // A label reads '\alpha: 𝛼'. The name is what comes before the first colon-space
    const at = label.indexOf(": ");
    labels.set((at === -1) ? label : label.slice(0, at), {
        gives : (at === -1) ? "" : label.slice(at + 2),
        insert : insert
    });
};

/* ---------- the order and the grouping core.js already uses ---------- */

function sectionsOfMathDictionary() {
    const src = readFileSync(join(root, "js/core.js"), "utf8").split("\n");
    const start = src.findIndex((line) => line.startsWith("const mathDictionary = {"));
    const groups = [];
    let current = null;
    for (let i = start + 1; i < src.length; i += 1) {
        const line = src[i];
        if (line.startsWith("};")) { break; };
        // Exactly four spaces: a heading sits at the top level of the object literal.
        // Anything indented further is a note inside a function and not a section
        const heading = line.match(/^ {4}\/\/ ([A-Z][^\n]{0,38})$/);
        if (heading) {
            current = { name: heading[1].trim(), commands: [] };
            groups.push(current);
            continue;
        };
        const entry = line.match(/^\s*"((?:\\\\|[^"])+)"\s*:/);
        if (entry && current) { current.commands.push(entry[1].replace(/\\\\/g, "\\")); };
    };
    return groups.filter((g) => g.commands.length > 0);
};

/* ---------- sections ---------- */

/* core.js names these for whoever is reading core.js; a reader here wants other words */
const renamed = {
    "Math operators" : "Operators",
    "Convert text" : "Fonts",
    "For Lewis Notation" : "Lewis notation",
    "Non italic letters" : "Upright letters",
    "To build your own" : "Building your own",
    "Square root and fractions" : "Roots and fractions",
    "Hebrew alphabet" : "Hebrew letters"
};

const notes = {
    "Fonts" : "Each takes what follows it, with or without curly brackets: " +
              "<code>\\mathbb R</code> and <code>\\mathbb{R}</code> both give ℝ.",
    "Combining symbols" : "These sit on top of the character that follows, so they are the " +
              "one place MatTalX does build a symbol rather than look one up.",
    "Building your own" : "Written in Settings, under <b>Commands &amp; operators</b>, not in the box.",
    "Lewis notation" : "For drawing molecules. Use the <code>!chem</code> document class, " +
              "which stops letters being italicised.",
    "Upright letters" : "The letters you get with <b>Mathematical font</b> unticked.",
    "Matrix" : "A matrix is written as rows in square brackets: " +
              "<code>\\matrix{[a,b][c,d]}</code>."
};

const mathSections = sectionsOfMathDictionary().map((group) => {
    const pairs = [];
    for (const name of group.commands) {
        const known = labels.get(name);
        if (known) {
            pairs.push([known.insert, known.gives]);
        } else {
            const value = dictionaries.mathDictionary[name];
            if (typeof value === "string") { pairs.push([name, spaceCommand(value)]); };
        };
    };
    const title = renamed[group.name] ?? group.name;
    return { title : title, pairs : pairs, note : notes[title] };
}).filter((s) => s.pairs.length > 0);

const greek = Object.keys(dictionaries.stdGreek).map((name) =>
    [name, dictionaries.stdGreek[name] + "\u2003" + dictionaries.noStyleGreek[name]]);

/* Superscript and subscript are keyed by the character they lift, not by a command */
const lifted = (dict, mark) => Object.keys(dict)
    .filter((c) => /^[\x21-\x7E]$/.test(c))
    .map((c) => [mark.replace("x", c), dict[c]]);

const textOnly = Object.keys(dictionaries.textCommands).map((name) => {
    const value = dictionaries.textCommands[name];
    return [name, (typeof value === "function") ? (labels.get(name)?.gives ?? "") : spaceCommand(value)];
});

/* Greek goes after the three big mathematical sections; the rest keep core.js's order */
const sections = [
    ...mathSections.slice(0, 3),
    { title : "Greek letters", pairs : greek,
      note : "Two forms are listed: the mathematical italic MatTalX uses by default, and " +
             "the upright one you get with <b>Mathematical font</b> unticked." },
    ...mathSections.slice(3),
    { title : "Superscript", pairs : lifted(dictionaries.Superscript, "^{x}"),
      note : "Anything below can be raised. Write <code>^</code> and the character, or " +
             "<code>^{...}</code> for more than one. Everything has to stay on one line, " +
             "so a superscript inside a superscript has no answer." },
    { title : "Subscript", pairs : lifted(dictionaries.Subscript, "_{x}"),
      note : "The same, lowered, with <code>_</code>." },
    { title : "Outside math mode", pairs : textOnly,
      note : "These work in ordinary text, outside the <code>$ ... $</code>." }
];

/* ---------- prose ---------- */

const prose = [
{ id : "start", title : "Getting started", html : `
<p>MatTalX turns a LaTeX command into the Unicode character it stands for.
<code>\\alpha</code> becomes 𝛼, <code>\\implies</code> becomes ⟹, <code>x^2</code> becomes 𝑥².
The result is ordinary text, so it can be sent through anything that carries text: a
message, an email, a commit message, a post.</p>
<p>There are three ways to use it. In the popup, write in the first box and press
<b>Convert</b>. In the page, write where you already are and press a shortcut. Or use the
<a href="../web-version/">web version</a>, which needs nothing installed.</p>
<p class="aside">Every program draws Unicode a little differently. A symbol that looks
wrong in one place is usually right in another, and is almost always the font rather than
the character.</p>
` },

{ id : "math-mode", title : "Where the maths goes", html : `
<p>MatTalX does not convert everything you write, because most of what you write is not
mathematics. It converts what sits between delimiters, and leaves the rest alone.</p>
<table class="cmds wide">
    <tr><td class="cmd"><code>$ ... $</code></td><td>The usual one. <code>Let $x \\in \\mathbb R$.</code> gives <span class="sym">Let 𝑥 ∈ ℝ.</span></td></tr>
    <tr><td class="cmd"><code>\\( ... \\)</code></td><td>The same thing, written the way LaTeX writes inline maths.</td></tr>
    <tr><td class="cmd"><code>\\[ ... \\]</code></td><td>The same again. LaTeX uses it for a displayed equation; here it reads as inline, because everything is one line.</td></tr>
</table>
<p>If you would rather have everything converted and never write a delimiter, tick
<b>Math mode</b> under the question mark. An ordinary sentence will then be converted too,
which is what you want when you are only writing mathematics and not otherwise.</p>
` },

{ id : "shortcuts", title : "Shortcuts", html : `
<p>MatTalX works where you are already writing, without the popup.</p>
<table class="cmds wide">
    <tr><td class="cmd"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>W</kbd></td><td>Convert what you have written, in place.</td></tr>
    <tr><td class="cmd"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd></td><td>Suggest a command as you write it. <code>\\arrow</code> finds <code>\\rightarrow</code>.</td></tr>
    <tr><td class="cmd"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd></td><td>Open and close MatTalX.</td></tr>
</table>
<p class="aside">A browser hands out these shortcuts when an extension is installed and
leaves them alone afterwards, so a shortcut added in an update can start unbound. If one
does nothing, open <b>Settings</b>: it lists what each is bound to, and has a button to
the page where the browser lets you change them.</p>
<p>Some editors keep their own copy of what you type and refuse to be written into —
Google Docs, Notion, Slack and anything else built on a rich-text framework. In those,
MatTalX converts and puts the result on your clipboard instead, and tells you it has.</p>
` },

{ id : "differences", title : "How it differs from LaTeX", html : `
<p>The commands are LaTeX's, but the output is a line of characters rather than a
typeset box, and that changes what is possible.</p>
<p><b>A symbol is looked up, not built.</b> ≝ is <code>\\def</code> here, where LaTeX
writes <code>\\stackrel{\\rm def}{=}</code>. The exception is
<a href="#combining-symbols">combining symbols</a>, which really do stack.</p>
<p><b>Everything stays on one line.</b> <code>x^{x^{x^{x}}}</code> has no answer, because
a superscript cannot itself carry a superscript. Nor can
<code>\\frac{\\frac{\\frac{a}{b}}{c}}{d}</code>. Write <code>x^(x^(x^(x)))</code> and
<code>((a/b)/c)/d</code> instead.</p>
<p><b>When a command has no answer, MatTalX says so</b> under the second box, naming the
command rather than silently leaving it as it was.</p>
` },

{ id : "your-own", title : "Building your own commands", html : `
<p>Under <b>Settings → Commands &amp; operators</b>, <b>Build</b> adds a row. Four kinds
can be written:</p>
<table class="cmds wide">
    <tr><td class="cmd"><code>\\newcommand</code></td><td>A name of your own for something MatTalX already knows: <code>{\\reals}{\\mathbb R}</code>.</td></tr>
    <tr><td class="cmd"><code>\\renewcommand</code></td><td>The same, for a name MatTalX already uses, which yours then replaces.</td></tr>
    <tr><td class="cmd"><code>\\DeclareMathOperator</code></td><td>An operator, which takes an argument: <code>{\\Aut}{Aut}</code> then gives Aut(𝐺) for <code>\\Aut{G}</code>.</td></tr>
    <tr><td class="cmd"><code>\\DeclareUnicodeCharacter</code></td><td>A character by its code point, for anything MatTalX has no name for.</td></tr>
</table>
<p>Your own commands are suggested before the built-in ones, and they are remembered.</p>
` },

{ id : "chemistry", title : "Chemistry", html : `
<p><code>\\ce{...}</code> writes a formula the way <i>mhchem</i> does:
<code>\\ce{H2O}</code> gives H₂O, and <code>\\ce{SO4^2-}</code> gives SO₄²⁻.</p>
<p>For Lewis structures, start the text with <code>!chem</code>. That switches to a
document class where letters are not italicised, which is what you want for an element
symbol, and makes the <a href="#lewis-notation">dot and bond marks</a> available.</p>
` }
];

/* ---------- the page ---------- */

const escape = (s) => String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const total = sections.reduce((n, s) => n + s.pairs.length, 0);

/* A list rather than a table: these are pairs, and a list flows into columns, which is
   what 132 relations need in order to be readable rather than a mile of scrolling */
const listFor = (pairs) =>
`            <ul class="cmds">
${pairs.map(([name, gives]) =>
`                <li><code>${escape(name)}</code><span class="sym" tabindex="0" role="button" title="Copy">${escape(gives)}</span></li>`
).join("\n")}
            </ul>`;

const nav =
`                <p class="navhead">Reading</p>
${prose.map((p) => `                <a href="#${p.id}">${escape(p.title)}</a>`).join("\n")}
                <p class="navhead">Commands</p>
${sections.map((s) => `                <a href="#${slug(s.title)}">${escape(s.title)} <span class="count">${s.pairs.length}</span></a>`).join("\n")}`;

const body =
`${prose.map((p) =>
`        <section id="${p.id}" class="prose">
            <h2>${escape(p.title)}</h2>
${p.html.trim().split("\n").map((l) => "            " + l).join("\n")}
        </section>`).join("\n")}

${sections.map((s) =>
`        <section id="${slug(s.title)}" class="commands">
            <h2>${escape(s.title)} <span class="count">${s.pairs.length}</span></h2>
${s.note ? `            <p class="note">${s.note}</p>\n` : ""}${listFor(s.pairs)}
        </section>`).join("\n")}`;

const page =
`<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="Every MatTalX command and the Unicode character it gives: ${total} of them, with the delimiters, the shortcuts, and how it differs from LaTeX.">
        <link rel="stylesheet" href="../css/docs.css">
        <link rel="icon" type="image/png" sizes="32x32" href="../images/mattalx_favicon32.png">
        <link rel="icon" type="image/png" sizes="48x48" href="../images/mattalx_favicon48.png">
        <link rel="icon" type="image/png" sizes="96x96" href="../images/mattalx_favicon96.png">
        <link rel="icon" type="image/png" sizes="128x128" href="../images/mattalx_favicon128-nobg.png">
        <link rel="canonical" href="https://mattalx.org/docs/">
        <meta property="og:type" content="website">
        <meta property="og:url" content="https://mattalx.org/docs/">
        <meta property="og:site_name" content="MatTalX">
        <meta property="og:title" content="MatTalX Documentation">
        <meta property="og:description" content="Every MatTalX command and the Unicode character it gives: ${total} of them, searchable.">
        <meta property="og:image" content="https://mattalx.org/images/og-card.png">
        <meta name="twitter:card" content="summary_large_image">
        <title>MatTalX Documentation</title>
    </head>
    <body>
        <!--
            This page is generated from the conversion engine by tools/build-docs.mjs.
            Do not edit it by hand: run 'npm run docs' after js/core.js changes.
        -->
        <header>
            <a href="../"><img alt="MatTalX" id="logo" src="../images/mattalx_logo_nobg_dark.png"></a>
            <span id="version">v ${VERSION}</span>
        </header>

        <div id="layout">
            <nav id="toc" aria-label="Contents">
${nav}
            </nav>

            <main>
                <h1>Documentation</h1>
                <p id="lede">Every command MatTalX knows and the character it gives &mdash;
                    ${total} of them &mdash; with the delimiters, the shortcuts, and what it
                    cannot do. Click any symbol to copy it.</p>

                <div id="searchbar">
                    <input type="search" id="search" placeholder="Search a command or a symbol, e.g. arrow, int, \\le" autocomplete="off" spellcheck="false">
                    <span id="searchcount"></span>
                </div>

                <div id="getit" class="prose">
                    <a class="button" target="_blank" href="https://chrome.google.com/webstore/detail/mattalx-write-math-symbol/jllceliamggkpffccbefpefgmcigaglb">Chrome extension</a>
                    <a class="button" target="_blank" href="https://addons.mozilla.org/firefox/addon/mattalx-write-math-symbols/">Firefox add-on</a>
                    <a class="button" href="../web-version/">Try it in the browser</a>
                </div>

${body}

                <section id="video" class="prose">
                    <h2>Watching it work</h2>
                    <p>A command written into an ordinary text box, and what happens to it.</p>
                    <video id="demo" muted loop playsinline autoplay controls preload="metadata"
                           width="968" height="423" aria-label="MatTalX converting a command in a text box">
                        <source src="../images/demo.webm" type="video/webm">
                        Your browser cannot play this recording.
                    </video>
                    <p class="aside">Recorded against a plain text box, which is where MatTalX
                        writes the result back in place. In an editor that keeps its own copy of
                        what you type, it uses the clipboard instead.</p>
                </section>

                <section id="more" class="prose">
                    <h2>Anything else</h2>
                    <p>Found a bug, or a symbol MatTalX should know?
                        <a target="_blank" href="https://github.com/samueleblanc/MatTalX/issues">Open an issue</a>.
                        The code is <a target="_blank" href="https://github.com/samueleblanc/MatTalX">on GitHub</a>,
                        and so are the <a target="_blank" href="https://github.com/samueleblanc/MatTalX/tree/master/docs">older PDF versions</a>
                        of this document.</p>
                    <p>MatTalX privacy policy is <a href="../privacy/">here</a>.</p>
                </section>
            </main>
        </div>

        <script src="../js/docs.js"></script>
    </body>
</html>
`;

writeFileSync(join(root, "docs/index.html"), page);
console.log(`docs/index.html written: ${sections.length} tables, ${total} rows, ${(page.length/1024).toFixed(0)} KB`);
for (const s of sections) { console.log(String(s.pairs.length).padStart(6), s.title); };
