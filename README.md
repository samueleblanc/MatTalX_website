![MatTalX logo](/images/mattalx_logo.png)

## Website

<a href="https://mattalx.org" target="_blank">https://mattalx.org</a>

## Use MatTalX

Versions:
* <a href="https://chrome.google.com/webstore/detail/mattalx-write-math-symbol/jllceliamggkpffccbefpefgmcigaglb" target="_blank">Chrome</a>
* <a href="https://addons.mozilla.org/firefox/addon/mattalx-write-math-symbols/" target="_blank">Firefox</a>
* <a href="https://mattalx.org/web-version/">Web version</a>

## MatTalX repo
<a href="https://github.com/samueleblanc/MatTalX" target="_blank">Here</a>

## The documentation page

`docs/index.html` is generated, not written. `tools/build-docs.mjs` reads `js/core.js` and
`js/completion.js` and emits every command with the character it gives, so the page cannot
drift from what the extension actually does.

```
npm run docs
```

Run it after `js/core.js` changes -- which is to say after a sync pull request is merged --
and commit the result. Editing `docs/index.html` by hand will be undone the next time it runs.

## Note on js/core.js and js/completion.js

`js/core.js` converts, and `js/completion.js` decides what to suggest. Both are copied straight from
the MatTalX repository and neither should ever be edited here: a change to either one over there opens
a pull request on this repository on its own.

Both know nothing about the DOM, which is what makes them safe to share. `js/web-version.js` draws
the result and belongs to this repository.