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

    The Settings box holds what the extension's holds, without the three shortcuts a
    browser hands to an extension and will not hand to a page. There is therefore no
    shortcut that opens the completion box, so its button is always shown and has no
    setting of its own.
*/

"use strict";

import { convert, errorHeader, reportError, resetErrors } from "./core.js";
import {
    findWord,
    semiAutoCompletion,
    completionList
} from "./completion.js";


/// GLOBALS ///

/** HTMLElements **/

const convertButton = document.getElementById("convert");
const copyButton = document.getElementById("copy");
const resetButton = document.getElementById("reset");

// Always shown: with no keyboard shortcut to open the completion box, the button is the
// only way in, so unlike the extension it has no setting of its own
const completionBtn = document.getElementById("completionBtn");

// '$', '\\', '{' and '}': the four a phone keyboard buries a few taps deep
const symbolRow = document.getElementById("symbolRow");
const symbolButtons = [...document.getElementsByClassName("symbolBtn")];

// Originally hidden
const completionPopup = document.getElementById("completion");

// The three in the dropdown
const spacesButton = document.getElementById("adjust");
const changeFontButton = document.getElementById("mathFont");
const changeModeButton = document.getElementById("mathMode");

// Settings
const settingsBtn = document.getElementById("settingsBtn");
const settingsBox = document.getElementById("settingsBox");
const resetSettingsButton = document.getElementById("resetSettingsBtn");
const darkMode = document.getElementById("darkMode");
const fontSize = document.getElementById("fontSize");
const fontFamily = document.getElementById("fontFamily");
const setCopyInputKey = document.getElementById("shortCopyInputK");
const setCopyInputLetter = document.getElementById("shortCopyInputL");
const setCopyOutputKey = document.getElementById("shortCopyOutputK");
const setCopyOutputLetter = document.getElementById("shortCopyOutputL");
const showMainSymbols = document.getElementById("showMainSymbols");

// Commands & Operators
const buildCommandsBtn = document.getElementById("buildNewCommand");
const commandsBuilt = document.getElementById("commandsBuilt");

// First and second text box
const textIn = document.getElementById("text_in");
const textOut = document.getElementById("text_out");

const mistakesBox = document.getElementById("mistakes");


/** Other **/

// The suggestions currently shown, and which one the arrows are on
let suggestions = [];
let chosenSuggestion = 0;


/** What is remembered **/

// The extension keeps these in chrome.storage; a page has localStorage and nothing else.
// The names are the extension's, so a setting means the same thing in both
const storageKey = "mattalx";

// What the first box says to someone who has never been here. The same sentence the
// extension writes on install: something to press Convert on, rather than an empty box
const firstExample = "For all $\\epsilon > 0$, there is $N > 0$ such that $n > N$ implies " +
                     "$|x_n - x| < \\epsilon$, where $x \\in \\mathbb R$.";

const prefersDarkMode = (window.matchMedia) ?
    window.matchMedia("(prefers-color-scheme: dark)").matches : false;

// A phone or a tablet, rather than anything that merely reports a touch digitiser:
// plenty of laptops answer yes to 'ontouchstart' while being driven with a trackpad
const touchScreen = (window.matchMedia) ?
    window.matchMedia("(hover: none) and (pointer: coarse)").matches : false;

const defaults = {
    box1 : firstExample,
    spaces : true,
    font : true,
    mode : false,                     // Off, so '$', '\(' and '\[' say where the maths is
    dark_mode : prefersDarkMode,
    font_size : 14,
    font_family : "monospace",
    copy_input_key : "Alt",
    copy_input_letter : "I",
    copy_output_key : "Alt",
    copy_output_letter : "O",
    main_symbols : touchScreen,       // '$', '\\', '{' and '}', hard to reach on a phone
    built_commands : []               // Array of {type, newInput, output}
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

function settingsFromBox() {
    // Everything the interface holds, in the shape it is stored in
    return {
        box1 : textIn.value,
        spaces : spacesButton.checked,
        font : changeFontButton.checked,
        mode : changeModeButton.checked,
        dark_mode : darkMode.checked,
        font_size : fontSize.value,
        font_family : fontFamily.value,
        copy_input_key : setCopyInputKey.value,
        copy_input_letter : setCopyInputLetter.value,
        copy_output_key : setCopyOutputKey.value,
        copy_output_letter : setCopyOutputLetter.value,
        main_symbols : showMainSymbols.checked,
        built_commands : storeCommands()
    };
};

function saveSettings() {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(settingsFromBox()));
    } catch (err) {
        return;  // Nothing to be done about it, and not worth interrupting anyone over
    };
};

function applyStoredSettings() {
    const settings = loadSettings();

    // The first box and the three checkboxes of the dropdown
    textIn.value = settings.box1;
    spacesButton.checked = settings.spaces;
    changeFontButton.checked = settings.font;
    changeModeButton.checked = settings.mode;

    // Everything inside the Settings box
    darkMode.checked = settings.dark_mode;
    updateTheme();

    fontSize.value = settings.font_size;
    fontFamily.value = settings.font_family;

    setCopyInputKey.value = settings.copy_input_key;
    setCopyInputLetter.value = settings.copy_input_letter;
    setCopyOutputKey.value = settings.copy_output_key;
    setCopyOutputLetter.value = settings.copy_output_letter;

    showMainSymbols.checked = settings.main_symbols;

    buildStoredCommands(settings.built_commands);
    applySettings();
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

function copyTextIn() {
    // Copy first box (input) to clipboard
    navigator.clipboard.writeText(textIn.value);
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

function verifySettings(variable, varType) {
    // Makes sure the settings are appropriate
    const restriction = {
        "font" : {min: 1, max: 99},
        "letter" : {min: "A", max: "z"}
    };
    if ((variable < restriction[varType].min) || (variable > restriction[varType].max)) {
        const errReason = (varType === "letter") ? "not an accepted character" : "out of range";
        resetErrors();
        showErrors(reportError("Settings", variable + " is " + errReason));
    };
};

function applySettings() {
    // The font, the symbol row, and a word if the two copy shortcuts are the same one
    // Called when the page opens, when the Settings box closes, and by resetSettings()
    const listShortcuts = [
        [setCopyInputKey.value, "+", setCopyInputLetter.value.toUpperCase()].join(""),
        [setCopyOutputKey.value, "+", setCopyOutputLetter.value.toUpperCase()].join("")
    ].filter((shortcut) => shortcut);
    if ((new Set(listShortcuts)).size !== listShortcuts.length) {
        showErrors(reportError("Settings", "At least two shortcuts are identical"));
    };

    textIn.style.fontSize = fontSize.value.toString() + "px";
    textOut.style.fontSize = (parseInt(fontSize.value)+1).toString() + "px";

    textIn.style.fontFamily = fontFamily.value;
    textOut.style.fontFamily = fontFamily.value;

    showSymbols();
};

function updateTheme() {
    // The stylesheet holds both palettes and follows the system on its own. This says
    // when the switch in Settings has overruled it, which it has to be able to do in
    // both directions: a light page on a dark system, and a dark one on a light system
    document.body.classList.toggle("darkChosen", darkMode.checked);
    document.body.classList.toggle("lightChosen", !darkMode.checked);
};

function showSymbols() {
    // The four symbol keys follow their setting
    // A class rather than a display, so the stylesheet decides whether they sit on the
    // line with Convert or on one of their own, which is what a phone wants
    symbolRow.classList.toggle("shown", showMainSymbols.checked);
};

function writeSymbol(symbol) {
    // Writes the symbol where the cursor is, or over what is selected, and leaves the
    // cursor after it. Clicking the button takes the focus off the box, but a textarea
    // keeps where its cursor was, so it can be put back exactly
    const start = textIn.selectionStart;
    const end = textIn.selectionEnd;
    textIn.value = textIn.value.substring(0, start) + symbol + textIn.value.substring(end);
    textIn.focus();
    textIn.setSelectionRange(start + symbol.length, start + symbol.length);
};

function resetSettings() {
    // Give each setting its default value
    darkMode.checked = defaults.dark_mode;
    fontSize.value = defaults.font_size;
    fontFamily.value = defaults.font_family;
    setCopyInputKey.value = defaults.copy_input_key;
    setCopyInputLetter.value = defaults.copy_input_letter;
    setCopyOutputKey.value = defaults.copy_output_key;
    setCopyOutputLetter.value = defaults.copy_output_letter;
    showMainSymbols.checked = defaults.main_symbols;

    updateTheme();
    applySettings();
};

function openSettings() {
    settingsBox.style.display = "block";
};

function closeSettings() {
    verifySettings(fontSize.value, "font");
    verifySettings(setCopyInputLetter.value, "letter");
    verifySettings(setCopyOutputLetter.value, "letter");

    applySettings();
    saveSettings();

    settingsBox.style.display = "none";
};


//-----------------------------------------------------//


/** Build commands and operators **/

function buildNewCommand() {
    // Adds a command (one row) to the 'commandsBuilt' table
    // The cells are laid out the way storeCommands() reads them back: the type, then the
    // name, then what it gives, then the button that removes the row
    commandsBuilt.style.display = "block";

    const row = document.createElement("tr");

    // Curly brackets around the fields, to mimic the style of \newcommand{}{}
    const wrapped = (input) => {
        const cell = document.createElement("td");
        const left = document.createElement("span");
        const right = document.createElement("span");
        left.textContent = "{";
        right.textContent = "}";
        cell.append(left, input, right);
        return cell;
    };

    const typeCell = document.createElement("td");
    const selectCmdType = document.createElement("select");
    selectCmdType.className = "commandList";
    for (const name of ["\\newcommand", "\\renewcommand",
                        "\\DeclareMathOperator", "\\DeclareUnicodeCharacter"]) {
        const option = document.createElement("option");
        option.text = name;
        option.value = name;
        selectCmdType.add(option);
    };
    typeCell.appendChild(selectCmdType);
    row.appendChild(typeCell);

    // The command name to be used, and what it gives
    for (const width of ["80%", "80%"]) {
        const field = document.createElement("input");
        field.type = "text";
        field.style.width = width;
        field.style.display = "inline";
        row.appendChild(wrapped(field));
    };

    const deleteCell = document.createElement("td");
    const deleteCommandBtn = document.createElement("input");
    deleteCommandBtn.type = "button";
    deleteCommandBtn.value = "☒";
    deleteCommandBtn.style.fontSize = "18px";
    deleteCommandBtn.style.padding = "5px";
    deleteCommandBtn.addEventListener("click", () => {
        row.remove();
        if (commandsBuilt.rows.length === 0) {
            commandsBuilt.style.display = "none";
        };
    });
    deleteCell.appendChild(deleteCommandBtn);
    row.appendChild(deleteCell);

    commandsBuilt.appendChild(row);
};

function buildStoredCommands(builtCommands) {
    // Adds a row in the Settings box for each command the user built
    for (let i=commandsBuilt.rows.length; i<builtCommands.length; i+=1) {
        buildNewCommand();
        commandsBuilt.rows[i].cells[0].children[0].value = builtCommands[i].type;
        commandsBuilt.rows[i].cells[1].children[1].value = builtCommands[i].newInput;
        commandsBuilt.rows[i].cells[2].children[1].value = builtCommands[i].output;
    };
};

function storeCommands() {
    // Loops on all the commands and returns an array containing all the info
    const commandsList = [];
    for (let i=0; i<commandsBuilt.rows.length; i+=1) {
        if (commandsBuilt.rows[i].cells[0].children[0].value !== undefined &&
            commandsBuilt.rows[i].cells[1].children[1].value !== "" &&
            commandsBuilt.rows[i].cells[2].children[1].value !== "")
        {
            commandsList.push({
                type : commandsBuilt.rows[i].cells[0].children[0].value,
                newInput : commandsBuilt.rows[i].cells[1].children[1].value,
                output : commandsBuilt.rows[i].cells[2].children[1].value
            });
        };
    };
    return commandsList;
};


//-----------------------------------------------------//


/** Completion box **/

function closeCompletion() {
    // Close and empties the completion popup
    completionPopup.style.display = "none";
    completionPopup.textContent = "";
    suggestions = [];
    chosenSuggestion = 0;
};

function pickSuggestion(i) {
    // Moves the highlight, the way the arrows do in the extension
    if (suggestions.length === 0) {
        return;
    };
    suggestions[chosenSuggestion].classList.remove("chosen");
    chosenSuggestion = (i + suggestions.length) % suggestions.length;
    suggestions[chosenSuggestion].classList.add("chosen");
    suggestions[chosenSuggestion].scrollIntoView({block: "nearest"});
};

function takeSuggestion() {
    // Enter writes the command that is highlighted, which is what clicking it does
    if (suggestions.length > 0) {
        suggestions[chosenSuggestion].click();
    };
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
    // two can't end up suggesting different things. The commands the user built are
    // passed along, so their own ones are suggested first
    const found = completionList(command, storeCommands(), changeFontButton.checked);
    suggestions = [];
    chosenSuggestion = 0;

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
        suggestions.push(btn);
    };
    pickSuggestion(0);
};


//-----------------------------------------------------//


/** Main **/

function main() {
    // Takes the original text (input) and outputs the new one, with the converted symbols
    const settings = settingsFromBox();

    const result = convert(textIn.value + " ", {
        mathMode : settings.mode,
        mathFont : settings.font,
        adjustSpaces : settings.spaces,
        customCommands : settings.built_commands
    });

    textOut.value = result.text;
    textOut.disabled = false;
    showErrors(result.errors);
    saveSettings();
};


//-----------------------------------------------------//


/** Wiring **/

convertButton.onclick = function() {main()};
copyButton.onclick = function() {copyTextOut()};
resetButton.onclick = function() {clear()};
completionBtn.onclick = function() {getCompletion()};
settingsBtn.onclick = function() {openSettings()};
resetSettingsButton.onclick = function() {resetSettings()};
buildCommandsBtn.onclick = function() {buildNewCommand()};

for (const button of symbolButtons) {
    button.onclick = function() {writeSymbol(button.value)};
};

darkMode.addEventListener("click", updateTheme);

window.addEventListener("click", (event) => {
    // Closes the suggestion popup if the user clicks anywhere except on the suggestion
    // popup itself or the input box, and the Settings box if the click was beside it
    if (completionPopup.style.display === "inline-block") {
        if ((event.target.id !== "text_in") && (event.target.id !== "completionBtn")) {
            closeCompletion();
        };
    } else if (settingsBox.style.display === "block") {
        if (event.target.id === "settingsBox") {
            closeSettings();
        };
    };
});

document.addEventListener("keydown", (keyPressed) => {
    // The two copy shortcuts, then the keys that drive the completion box
    const heldDown = (chosen) =>
        ((keyPressed.altKey && !keyPressed.shiftKey && (chosen === "Alt")) ||
         (keyPressed.ctrlKey && !keyPressed.shiftKey && (chosen === "Ctrl")) ||
         (keyPressed.altKey && keyPressed.shiftKey && (chosen === "Alt+Shift")) ||
         (keyPressed.ctrlKey && keyPressed.shiftKey && (chosen === "Ctrl+Shift")));
    const isLetter = (letter) =>
        (keyPressed.key.toUpperCase() === letter.toUpperCase());

    if (isLetter(setCopyInputLetter.value) && heldDown(setCopyInputKey.value)) {
        keyPressed.preventDefault();
        copyTextIn();
    } else if (isLetter(setCopyOutputLetter.value) && heldDown(setCopyOutputKey.value)) {
        keyPressed.preventDefault();
        copyTextOut();
    } else if (completionPopup.style.display === "inline-block") {
        // If any key is pressed while the completion popup is opened, it adjusts the suggestions
        // The word must be adjusted "by hand" because the eventListener is synchronous
        if ((keyPressed.key === "ArrowDown") || (keyPressed.key === "ArrowUp")) {
            keyPressed.preventDefault();
            pickSuggestion(chosenSuggestion + ((keyPressed.key === "ArrowDown") ? 1 : -1));
        } else if (keyPressed.key === "Enter") {
            keyPressed.preventDefault();
            takeSuggestion();
        } else if (keyPressed.key === "Escape") {
            closeCompletion();
        } else if (keyPressed.key === "Backspace") {
            completionPopup.textContent = "";
            completion(findWord(textIn.value, textIn.selectionEnd - 1, "Backspace"));
        } else if (keyPressed.code === "Space") {
            closeCompletion();
        } else if (keyPressed.key.length === 1) {  // i.e. A letter
            completionPopup.textContent = "";
            completion(findWord(textIn.value, textIn.selectionEnd - 1, keyPressed.key));
        } else if ((keyPressed.key === "ArrowRight") || (keyPressed.key === "ArrowLeft")) {
            completionPopup.textContent = "";
            const arrows = {"ArrowRight": 1, "ArrowLeft": -1};
            completion(findWord(textIn.value, (textIn.selectionEnd - 1 + arrows[keyPressed.key])));
        };
    };
});

applyStoredSettings();
