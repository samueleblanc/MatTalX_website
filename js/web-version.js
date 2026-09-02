/*
    The interface of the web version of MatTalX.

    The conversion itself lives in core.js, which is the very same file the Chrome extension
    and the Firefox add-on use. It is copied here from the MatTalX repository, so it should
    never be edited by hand: https://github.com/samueleblanc/MatTalX
*/

"use strict";

import {
    convert,
    defaultDict,
    spaceCommand,
    errorHeader
} from "./core.js";


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


/** Other **/

// Used in the subsection 'Completion box' to recognize on which word is the cursor
const wordsDelimiters = [" ", "", "\u000A", "\\", "^", "_", "(", ")", "[", "]", "{", "}", ".", ",", "/", "-", "+", "=", "<", ">", "|", "?", "!", "$"];
const wordsDelimitersWOB = [" ", "", "\u000A", "^", "_", "(", ")", "[", "]", "{", "}", ".", ",", "/", "-", "+", "=", "<", ">", "|", "?", "!", "$"]; // Without backslash


/**************************************************************************************/


/// FUNCTIONS ///

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
    copyButton.value = "Copy text";
    mistakesBox.textContent = "";
    textOut.disabled = true;
    closeCompletion();
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

function findWord(text, cursorPosition, addedLetter="") {
    // Used in the completion popup
    // Finds the word that is touched by the cursor
    if (addedLetter.length === 1) {  // ie a letter
        text = text.split("");
        text[cursorPosition] += addedLetter;
        text = text.join("");
    } else if (addedLetter === "Backspace") {
        text = text.split("");
        text[cursorPosition] = "";
        text = text.join("");
        --cursorPosition;
    };
    let word = "";
    while (!(wordsDelimiters.includes(text.charAt(cursorPosition + 1)))) {
        ++cursorPosition;
    };
    while (!(wordsDelimitersWOB.includes(text.charAt(cursorPosition)))) {
        if (text.charAt(cursorPosition) === "\\") {
            word = text.charAt(cursorPosition) + word;
            break;
        } else {
            word = text.charAt(cursorPosition) + word;
            --cursorPosition;
        }
    };
    return word;
};

function completion(command) {
    // Outputs list of other commands that are similar to the one currently being written
    // The colors come from web-version.css, so light and dark mode are handled there
    if (command === "") {
        closeCompletion();
    } else if (command[0] !== "\\") {
        let row = completionPopup.insertRow(-1);
        let cell = row.insertCell(0);
        cell.textContent = "The first character of the command must be a backslash (\\). Superscript starts with ^ and subscript with _";
    } else {
        command = command.substring(1, command.length);  // Erases the backslash so that, for instance, \arrow will also show \rightarrow, etc.
        for (let keys in defaultDict) {
            // Puts commands in button form, so they can be clicked on to replace the command being written
            if (keys.toLowerCase().indexOf(command.toLowerCase()) !== -1) {
                let row = completionPopup.insertRow(-1);
                let cell = row.insertCell(0);
                let btn = document.createElement("button");
                btn.name = showCommand(keys);
                btn.textContent = toReplaceCommand(keys);
                btn.value = toReplaceCommand(keys);  // Value is unchanged
                btn.type = "button";
                btn.tabIndex = "0";

                // Complete the command if the user clicks on that command
                btn.addEventListener("click", () => {
                    textIn.value = semiAutoCompletion(textIn.value, textIn.selectionEnd, btn.value);
                    closeCompletion();
                    textIn.focus();
                });

                // Shows what the command ouputs on mouseover, return to normal on mouseout
                btn.addEventListener("mouseover", () => {
                    let tmp = btn.textContent;
                    btn.textContent = btn.name;
                    btn.name = tmp;
                });
                btn.addEventListener("mouseout", () => {
                    let tmp = btn.textContent;
                    btn.textContent = btn.name;
                    btn.name = tmp;
                });
                cell.appendChild(btn);
            };
        };
    };
};

function semiAutoCompletion(textIn, cursorPosition, command) {
    // Replace the command being written by the selected suggestion
    let textOut = textIn;
    // Find end of word
    while (!(wordsDelimiters.includes(textIn.charAt(cursorPosition)))) {
        ++cursorPosition;
    };
    // Deletes word
    while (textIn.charAt(cursorPosition - 1) !== "\\") {
        textOut = textOut.substring(0, cursorPosition - 1) + textOut.substring(cursorPosition);
        --cursorPosition;
    };
    // Replace by selected suggestion
    textOut = textOut.substring(0, cursorPosition - 1) + command + textOut.substring(cursorPosition);
    return textOut;
};

function showCommand(key) {
    // Used in completion
    // Changes what's seen when the user hovers on a command in the completion popup
    if (typeof defaultDict[key] == "function") {
        if (key == "\\sqrt") {
            return "\\sqrt[n]{x} \u2192 ⁿ√𝑥";
        } else if (key == "\\frac") {
            return "\\frac{1}{2} \u2192 ¹∕₂";
        } else if (key == "\\frac*") {
            return "\\frac*{1}{2} \u2192 ½";
        } else if ((key == "\\overset") || (key == "\\underset") || (key == "\\stackrel") || (key == "\\hspace") || (key == "\\vskip")) {
            return key + "{}";
        } else if ((key == "_") || (key == "^")) {
            return "x" + key + "{a1} \u2192 𝑥" + spaceCommand((defaultDict[key]([["a", "1"]], key)).join(""));
        } else if (key == "\\pmod") {
            return key + "{n} \u2192 " + spaceCommand(defaultDict[key]([["n"]], key).join(""));
        } else if (key == "\\matrix") {
            return key + "{[a,b]} \u2192 " + spaceCommand(defaultDict[key](["[a,b]".split("")], key).join(""));
        } else {
            return key + "{abc} \u2192 " + spaceCommand((defaultDict[key]([["a", "b", "c"]], key)).join(""));
        };
    } else {
        if (key == "\\:") {
            return "1 space";
        } else if ((key == "\\;") || ((key == "\\quad") || (key == "\\qquad"))) {
            return defaultDict[key].length + " spaces";
        } else if (key === "\\!") {
            return "Remove a space";
        } else if ((key == "\\id2") || (key == "\\id3") || (key == "\\id4") || (key == "\\idn")) {
            const M = {
                "\\id2": "⎡ 1 0 ⎤\u000A⎣ 0 1 ⎦",
                "\\id3" : "⎡ 1 0 0 ⎤\u000A⎢ 0 1 0 ⎥\u000A⎣ 0 0 1 ⎦",
                "\\id4" : "⎡ 1 0 0 0 ⎤\u000A⎢ 0 1 0 0 ⎥\u000A⎢ 0 0 1 0 ⎥\u000A⎣ 0 0 0 1 ⎦",
                "\\idn" : "⎡ 1 0 ⋯ 0 ⎤\u000A⎢ 0 1 ⋯ 0 ⎥\u000A⎢  ⋮  ⋮  ⋱  ⋮ ⎥\u000A⎣ 0 0 ⋯ 1 ⎦"
            }
            return M[key];
        } else {
            return spaceCommand(defaultDict[key]);
        };
    };
};

function toReplaceCommand(key) {
    // Used in completion
    // Changes what the user sees when the completion popup is opened
    if (typeof defaultDict[key] == "function") {
        if (key == "\\sqrt") {
            return "\\sqrt[]{}";
        } else if (key == "\\frac") {
            return "\\frac{}{}";
        } else if (key == "\\frac*") {
            return "\\frac*{}{}";
        } else {
            return key + "{}";
        };
    } else {
        return key
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
};
