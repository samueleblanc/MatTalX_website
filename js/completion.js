/*
    The commands MatTalX suggests while the user is writing one.

    Knows nothing about the DOM: the popup and the page both ask for the same list and
    draw it their own way, so what is suggested in one can't drift from the other.
*/

"use strict";

import { convert, defaultDict, dictionaries, spaceCommand } from "./core.js";

// What tells one word from the next, so the completion knows which one the cursor is on
const wordsDelimiters = [" ", "", "\u000A", "\\", "^", "_", "(", ")", "[", "]", "{", "}", ".", ",", "/", "-", "+", "=", "<", ">", "|", "?", "!", "$"];
const wordsDelimitersWOB = [" ", "", "\u000A", "^", "_", "(", ")", "[", "]", "{", "}", ".", ",", "/", "-", "+", "=", "<", ">", "|", "?", "!", "$"]; // Without backslash

export const noBackslash = "The first character of the command must be a backslash (\\). " +
                           "Superscript starts with ^ and subscript with _";

export function findWord(text, cursorPosition, addedLetter="") {
    // Finds the word that is touched by the cursor
    // The letter that was just typed has to be added by hand, since the key is read before
    // the page has had the time to write it
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

export function semiAutoCompletion(textIn, cursorPosition, command) {
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

// Commands written with two arguments rather than one
const twoArguments = ["\\frac", "\\frac*", "\\overset", "\\underset", "\\stackrel"];

// Commands whose argument is not a letter, or whose answer doesn't fit on a line
// '\\emph' is here for a different reason: it is the one command whose answer depends on
// how its argument already looks, and the preview is given a letter this dictionary has
// already converted. That made it read '\\emph: A → A', as though it did nothing
const inWords = {
    "\\emph" : "A → \u{1D608} and \u{1D608} → A",
    "\\:" : "1 space",
    "\\!" : "removes a space",
    "\\hspace" : "3 → 3 spaces",
    "\\vskip" : "3 → 3 empty lines",
    "\\matrix" : "[a,b] → [ a b ]",
    "\\id2" : "the 2x2 identity matrix",
    "\\id3" : "the 3x3 identity matrix",
    "\\id4" : "the 4x4 identity matrix",
    "\\idn" : "the n by n identity matrix"
};

let previewDict = {mathFont: null, dict: null};

function dictFor(mathFont) {
    // The same dictionary a conversion builds, so what a suggestion shows is what the
    // command really gives, in the font the user asked for
    if (previewDict.mathFont === mathFont) {
        return previewDict.dict;
    };
    const dict = {
        ...dictionaries.mathDictionary,
        ...((mathFont) ? dictionaries.stdGreek : dictionaries.noStyleGreek),
        ...((mathFont) ? dictionaries.lettersMath : dictionaries.lettersNoFont),
        ...dictionaries.accents
    };
    previewDict = {mathFont: mathFont, dict: dict};
    return dict;
};

function showCommand(key, dict) {
    // What a command gives, shown next to its name so nothing has to be guessed
    // e.g. '\\implies: ⟹' and '\\mathcal: A → 𝒜'
    if (Object.hasOwn(inWords, key)) {
        return key + ": " + inWords[key];
    };
    const value = dict[key];
    if (typeof value !== "function") {
        if ((key === "\\;") || (key === "\\quad") || (key === "\\qquad")) {
            return key + ": " + value.length + " spaces";
        };
        return key + ": " + spaceCommand(value);
    };
    // An argument reaches a command already converted, so the letter is converted first,
    // the same way the parser hands it over. 'A' is what the user is shown either way
    const two = twoArguments.includes(key);
    const args = (two) ? [[dict["A"]], [dict["B"]]] : [[dict["A"]]];
    try {
        return key + ": " + ((two) ? "A,B" : "A") + " → " + spaceCommand(value(args, key).join(""));
    } catch (err) {
        return key + "{}";
    };
};

function toReplaceCommand(key) {
    // What a suggestion writes in place of the command being typed
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

function builtCommands(customCommands, mathFont) {
    // The commands the user built themselves, shown like the ones MatTalX already knows
    // What they give is read from the conversion itself, which is the only thing that
    // knows what a command the user wrote yesterday does
    const built = [];
    for (const command of customCommands) {
        if ((!command) || (!command.type) || (!command.newInput) || (!command.output)) {
            continue;
        };
        const name = command.newInput.replace(/ /g, "");
        // An operator is the only one of the four that is written with an argument
        const withArg = (command.type === "\\DeclareMathOperator");
        const result = convert(name + ((withArg) ? "{A}" : "") + " ",
                               {mathMode: true, mathFont: mathFont, customCommands: customCommands});
        built.push({
            insert : (withArg) ? name + "{}" : name,
            label : name + ": " + ((withArg) ? "A → " : "") + result.text.replace(/ $/, "")
        });
    };
    return built;
};

let lastList = {key: null, commands: null};

export function everyCommand(customCommands=[], mathFont=true) {
    // Every command that can be suggested, the user's own ones first
    // The page is given the whole list at once, so it can narrow it down on its own as
    // the user keeps typing, without asking again. The popup asks for it on every
    // keystroke, so the last one is kept rather than built again for nothing
    const key = String(mathFont) + "\u0000" + JSON.stringify(customCommands);
    if (lastList.key === key) {
        return lastList.commands;
    };
    const dict = dictFor(mathFont);
    const own = builtCommands(customCommands, mathFont);
    const taken = own.map((command) => command.insert.replace("{}", ""));
    const commands = [...own];
    for (const name of Object.keys(defaultDict)) {
        if (taken.includes(name)) {
            continue;  // The user redefined it, so theirs is the one to suggest
        };
        commands.push({insert: toReplaceCommand(name), label: showCommand(name, dict)});
    };
    lastList = {key: key, commands: commands};
    return commands;
};

export function matching(commands, word) {
    // The commands to suggest for the word the cursor is on
    // 'note' is there when there is something to say rather than a list to show
    if (word === "") {
        return {note: null, matches: []};
    } else if (word[0] !== "\\") {
        return {note: noBackslash, matches: []};
    };
    // The backslash is dropped so that, for instance, '\arrow' also shows '\rightarrow'
    const looked = word.substring(1).toLowerCase();
    const matches = commands.filter((command) => command.insert.toLowerCase().indexOf(looked) !== -1);
    if (matches.length === 0) {
        return {note: "No command contains '" + word + "'", matches: []};
    };
    return {note: null, matches: matches};
};

export function completionList(word, customCommands=[], mathFont=true) {
    // What the completion box shows for the word the cursor is on
    return matching(everyCommand(customCommands, mathFont), word);
};
