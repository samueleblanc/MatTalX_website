/*
    The interface of the web version of MatTalX.

    Neither the conversion nor the list of suggestions lives here. core.js converts and
    completion.js decides what to suggest; both are the very same files the Chrome
    extension and the Firefox add-on use, copied here by a workflow in the MatTalX
    repository, so neither should ever be edited by hand:
    https://github.com/samueleblanc/MatTalX

    What belongs to this file is everything the browser gives a page rather than an
    extension: drawing the boxes, and remembering what was written in localStorage,
    where the extension has chrome.storage.
*/

"use strict";

import { convert, errorHeader } from "./core.js";
import {
    findWord,
    semiAutoCompletion,
    completionList
} from "./completion.js";


/// GLOBALS ///

/** HTMLElements **/

// Convert button
const convertButton = document.getElementById("convert");
convertButton.onclick = function() {main()};

// Copy button
const copyButton = document.getElementById("copy");
copyButton.onclick = function() {copyTextOut()};

// Clear button
const resetButton = document.getElementById("reset");
resetButton.onclick = function() {clear()};

// Button to open the completion popup
// Always shown here, since the web version has no keyboard shortcut
const completionBtn = document.getElementById("completionBtn");
completionBtn.onclick = function() {getCompletion()};
completionBtn.style.display = "inline-block";

// Originally hidden
const completionPopup = document.getElementById("completion");

// Adjust spaces button
const spacesButton = document.getElementById("adjust");

// Mathematical font button
const changeFontButton = document.getElementById("mathFont");

// Math mode button
const changeModeButton = document.getElementById("mathMode");

// First and second text box
const textIn = document.getElementById("text_in");
const textOut = document.getElementById("text_out");

const mistakesBox = document.getElementById("mistakes");


/** What is remembered **/

// The extension keeps these in chrome.storage; a page has localStorage and nothing else.
// The names match the extension's, so the two are read the same way when reasoning about
// either one, even though nothing is shared between a page and an extension
const storageKey = "mattalx";

// What the first box says to someone who has never been here. The same sentence the
// extension writes on install: something to press Convert on, rather than an empty box
const firstExample = "For all $\\epsilon > 0$, there is $N > 0$ such that $n > N$ implies " +
                     "$|x_n - x| < \\epsilon$, where $x \\in \\mathbb R$.";

const defaults = {
    box1 : firstExample,
    spaces : true,
    font : true,
    mode : false      // Off, so '$', '\(' and '\[' say where the maths is
};


/**************************************************************************************/


/// FUNCTIONS ///

/** Storage **/

function loadSettings() {
    // What was left here last time, with the defaults for anything missing
    // A browser refusing localStorage (private mode, cookies blocked) throws rather than
    // giving back nothing, and the page has to open anyway
    try {
        const stored = JSON.parse(window.localStorage.getItem(storageKey));
        return (stored) ? {...defaults, ...stored} : {...defaults};
    } catch (err) {
        return {...defaults};
    };
};

function saveSettings() {
    // Everything worth finding again: what is in the first box, and the three toggles
    try {
        window.localStorage.setItem(storageKey, JSON.stringify({
            box1 : textIn.value,
            spaces : spacesButton.checked,
            font : changeFontButton.checked,
            mode : changeModeButton.checked
        }));
    } catch (err) {
        return;  // Nothing to be done about it, and not worth interrupting anyone over
    };
};

function applyStoredSettings() {
    const settings = loadSettings();
    textIn.value = settings.box1;
    spacesButton.checked = settings.spaces;
    changeFontButton.checked = settings.font;
    changeModeButton.checked = settings.mode;
};

// Saved as the page goes away rather than on every keystroke. 'pagehide' is what a
// browser gives when the tab closes or the user navigates; 'visibilitychange' catches
// changing tab or putting the phone away, which on a phone is often the only one that
// fires. The extension listens for the very same pair, plus 'blur' for its popup
window.addEventListener("pagehide", saveSettings);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        saveSettings();
    };
});

applyStoredSettings();


//-----------------------------------------------------//


/** Front-end **/

function copyTextOut() {
    // Copy second box (output) to clipboard
    if (textOut.disabled === false) {
        navigator.clipboard.writeText(textOut.value);
        copyButton.value = "Copied!";
        setTimeout(() => {
            copyButton.value = "Copy text";
        }, 2500)  // Returns to initial copyButton
    };
};

function clear() {
    // Clears everything
    // The reset button empties the first box on its own, and that emptiness is what gets
    // remembered: someone who cleared the box meant to, and should not find the example
    // sentence waiting for them tomorrow
    copyButton.value = "Copy text";
    mistakesBox.textContent = "";
    textOut.disabled = true;
    closeCompletion();
    saveSettings();
};

function showErrors(errors) {
    // Writes the errors found by core.js in the box under the output
    mistakesBox.textContent = (errors.length > 0) ? errorHeader + errors : "";
};

window.addEventListener("click", (event) => {
    // Closes the suggestion popup if the users clicks anywhere except on the suggestion popup itself or input box
    if (completionPopup.style.display === "inline-block") {
        if ((event.target.id !== "text_in") && (event.target.id !== "completionBtn")) {
            closeCompletion();
        };
    };
});

document.addEventListener("keydown", (keyPressed) => {
    // If any key is pressed while the completion popup is opened, it adjusts the suggestions
    // The word must be adjusted "by hand" because the eventListener is synchronous
    if (completionPopup.style.display === "inline-block") {
        if (keyPressed.key === "Backspace") {
            completionPopup.textContent = "";
            let word = findWord(textIn.value, textIn.selectionEnd - 1, "Backspace");
            completion(word);
        } else if (keyPressed.code === "Space") {
            closeCompletion();
        } else if (keyPressed.key.length === 1) {  // i.e. A letter
            completionPopup.textContent = "";
            let word = findWord(textIn.value, textIn.selectionEnd - 1, keyPressed.key);
            completion(word);
        } else if ((keyPressed.key === "ArrowUp") || (keyPressed.key === "ArrowRight") || (keyPressed.key === "ArrowLeft") || (keyPressed.key === "ArrowDown")) {
            completionPopup.textContent = "";
            const arrows = {"ArrowUp": 0, "ArrowRight": 1, "ArrowLeft": -1, "ArrowDown": 0};
            let word = findWord(textIn.value, (textIn.selectionEnd - 1 + arrows[keyPressed.key]));  // Only adjusts the cursor position for right and left arrows
            completion(word);
        };
    };
});


//-----------------------------------------------------//


/** Completion box **/

function closeCompletion() {
    // Close and empties the completion popup
    completionPopup.style.display = "none";
    completionPopup.textContent = "";
};

function getCompletion() {
    // Calls completion() with the word touching the cursor if the popup is closed, else it closes the popup
    if (completionPopup.style.display !== "inline-block") {
        completionPopup.textContent = "";
        let word = findWord(textIn.value, textIn.selectionEnd - 1);
        completionPopup.style.display = "inline-block";
        completion(word);
    } else {
        closeCompletion();
    };
};

function completion(command) {
    // Outputs list of other commands that are similar to the one currently being written
    // What to suggest is decided in completion.js, which the extension uses too, so the
    // two can't end up suggesting different things
    // The colors come from web-version.css, so light and dark mode are handled there
    // The web version has no settings box, so no command built by the user is passed along
    const found = completionList(command, [], changeFontButton.checked);

    if ((found.note === null) && (found.matches.length === 0)) {
        closeCompletion();
        return;
    };
    if (found.note !== null) {
        const row = completionPopup.insertRow(-1);
        const cell = row.insertCell(0);
        cell.textContent = found.note;
        return;
    };

    for (const suggestion of found.matches) {
        // Puts commands in button form, so they can be clicked on to replace the command being written
        const row = completionPopup.insertRow(-1);
        const cell = row.insertCell(0);
        const btn = document.createElement("button");
        btn.textContent = suggestion.label;   // The command and what it gives
        btn.value = suggestion.insert;        // What gets written, which is not the same
        btn.type = "button";
        btn.tabIndex = "0";

        // Complete the command if the user clicks on that command
        btn.addEventListener("click", () => {
            textIn.value = semiAutoCompletion(textIn.value, textIn.selectionEnd, btn.value);
            closeCompletion();
            textIn.focus();
        });

        cell.appendChild(btn);
    };
};


//-----------------------------------------------------//


/** Main **/

function main() {
    // Takes the original text (input) and outputs the new one, with the converted symbols
    // The web version has no settings box, so no command built by the user is passed along

    const result = convert(textIn.value + " ", {
        mathMode : changeModeButton.checked,
        mathFont : changeFontButton.checked,
        adjustSpaces : spacesButton.checked
    });

    textOut.value = result.text;
    textOut.disabled = false;
    showErrors(result.errors);
    saveSettings();
};
