/*
    MatTalX conversion core.

    Takes text (mostly LaTeX commands), converts the commands into the desired symbol
    (character) and returns the result. Knows nothing about the DOM, so it is shared by
    the extension popup, the web version and the tests.

    The only entry point for a conversion is convert(text, settings).
*/

"use strict";

// Settings for the conversion in progress, set by convert()
// The interface used to read these straight from its checkboxes
export const defaultConversionSettings = {
    mathFont : true,
    mathMode : true,
    adjustSpaces : true,
    customCommands : []   // Array of {type, newInput, output}, as built in the settings box
};
let settings = {...defaultConversionSettings};

// Header the interface puts above the list of errors ("Errors" in bold)
export const errorHeader = "\u{1D404}\u{1D42B}\u{1D42B}\u{1D428}\u{1D42B}\u{1D42C}: \r\n";

// Symbol for an error, only used when there is nothing to show instead
const errSymbol = "\u{1D41E}\u0353\u{1D42B}\u0353\u{1D42B}";  // bold "err" with two "x" under it

// A conversion that fails keeps the text that caused it, surrounded by a character no dictionary
// can produce, so the output shows the command (or the character) rather than errSymbol
// The marks are removed by convert(), just before the text is given back to the interface
const failureMark = "\uE000";  // Private use area
const failureCode = failureMark.charCodeAt(0);

// Says if a value is a piece of text that couldn't be converted
// Compares the first character rather than the whole string, since this runs on every symbol
const isFailure = (value) => {
    return (typeof value === "string") && (value.charCodeAt(0) === failureCode);
};

// Same, for an array of values (e.g. the characters of an argument)
const hasFailure = (values) => {
    return values.some(isFailure);
};

// What stands in the output for a piece of text that couldn't be converted
// Falls back to errSymbol when there is nothing to show, and never marks a failure twice
const failure = (text) => {
    if (isFailure(text)) {
        return text;
    } else {
        return failureMark + ((text === undefined) ? errSymbol : text) + failureMark;
    };
};

// Removes the marks, leaving only the text that couldn't be converted
const stripFailures = (text) => {
    return text.split(failureMark).join("");
};

// Every undefined commands
let errorsList = "";

// Used by tokenizer() and tokensToText()
const specialTokens = {startMathmode: "STARTMM", endMathmode: "ENDMM", startArgument: "STARTARG", endArgument: "ENDARG"};

// Used by bracelessArg to refuse tokens that shouldn't become the argument of a braceless '^' or '_'
// Everything else is fair game, as in LaTeX, so 'x^(a)' puts the parenthesis in superscript
const notBracelessArg = ["$", " ", "\u000A", "\\\\"];

// Used in adjustSpacesCommon to chose which symbols to surround with spaces (if touched by a specific symbol like '+' or '-')
const characters = "AÀÂBCÇDEÉÈËÊFGHIJKLMNOÔÖPQRSTUÙÛVWXYZaàâbcçdeéèêëfghijklmnoôöpqrstuùûvwxyz0123456789"+
                   "𝐴𝐵𝐶𝐷𝐸𝐹𝐺𝐻𝐼𝐽𝐾𝐿𝑀𝑁𝑂𝑃𝑄𝑅𝑆𝑇𝑈𝑉𝑊𝑋𝑌𝑍𝑎𝑏𝑐𝑑𝑒𝑓𝑔ℎ𝑖𝑗𝑘𝑙𝑚𝑛𝑜𝑝𝑞𝑟𝑠𝑡𝑢𝑣𝑤𝑥𝑦𝑧"+
                   "𝔸𝔹ℂ𝔻𝔼𝔽𝔾ℍ𝕀𝕁𝕂𝕃𝕄ℕ𝕆ℙℚℝ𝕊𝕋𝕌𝕍𝕎𝕏𝕐ℤ𝕒𝕓𝕔𝕕𝕖𝕗𝕘𝕙𝕚𝕛𝕜𝕝𝕞𝕟𝕠𝕡𝕢𝕣𝕤𝕥𝕦𝕧𝕨𝕩𝕪𝕫𝟘𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡"+
                   "𝑨𝑩𝑪𝑫𝑬𝑭𝑮𝑯𝑰𝑱𝑲𝑳𝑴𝑵𝑶𝑷𝑸𝑹𝑺𝑻𝑼𝑽𝑾𝑿𝒀𝒁𝒂𝒃𝒄𝒅𝒆𝒇𝒈𝒉𝒊𝒋𝒌𝒍𝒎𝒏𝒐𝒑𝒒𝒓𝒔𝒕𝒖𝒗𝒘𝒙𝒚𝒛"+
                   "𝒜ℬ𝒞𝒟ℰℱ𝒢ℋℐ𝒥𝒦ℒℳ𝒩𝒪𝒫𝒬ℛ𝒮𝒯𝒰𝒱𝒲𝒳𝒴𝒵𝒶𝒷𝒸𝒹ℯ𝒻ℊ𝒽𝒾𝒿𝓀𝓁𝓂𝓃ℴ𝓅𝓆𝓇𝓈𝓉𝓊𝓋𝓌𝓍𝓎𝓏"+
                   "𝔄𝔅ℭ𝔇𝔈𝔉𝔊ℌℑ𝔍𝔎𝔏𝔐𝔑𝔒𝔓𝔔ℜ𝔖𝔗𝔘𝔙𝔚𝔛𝔜ℨ𝔞𝔟𝔠𝔡𝔢𝔣𝔤𝔥𝔦𝔧𝔨𝔩𝔪𝔫𝔬𝔭𝔮𝔯𝔰𝔱𝔲𝔳𝔴𝔵𝔶𝔷"+
                   "𝕬𝕭𝕮𝕯𝕰𝕱𝕲𝕳𝕴𝕵𝕶𝕷𝕸𝕹𝕺𝕻𝕼𝕽𝕾𝕿𝖀𝖁𝖂𝖃𝖄𝖅𝖆𝖇𝖈𝖉𝖊𝖋𝖌𝖍𝖎𝖏𝖐𝖑𝖒𝖓𝖔𝖕𝖖𝖗𝖘𝖙𝖚𝖛𝖜𝖝𝖞𝖟"+
                   "𝓐𝓑𝓒𝓓𝓔𝓕𝓖𝓗𝓘𝓙𝓚𝓛𝓜𝓝𝓞𝓟𝓠𝓡𝓢𝓣𝓤𝓥𝓦𝓧𝓨𝓩𝓪𝓫𝓬𝓭𝓮𝓯𝓰𝓱𝓲𝓳𝓴𝓵𝓶𝓷𝓸𝓹𝓺𝓻𝓼𝓽𝓾𝓿𝔀𝔁𝔂𝔃"+
                   "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵"+
                   "𝘈𝘉𝘊𝘋𝘌𝘍𝘎𝘏𝘐𝘑𝘒𝘓𝘔𝘕𝘖𝘗𝘘𝘙𝘚𝘛𝘜𝘝𝘞𝘟𝘠𝘡𝘢𝘣𝘤𝘥𝘦𝘧𝘨𝘩𝘪𝘫𝘬𝘭𝘮𝘯𝘰𝘱𝘲𝘳𝘴𝘵𝘶𝘷𝘸𝘹𝘺𝘻"+
                   "𝙰𝙱𝙲𝙳𝙴𝙵𝙶𝙷𝙸𝙹𝙺𝙻𝙼𝙽𝙾𝙿𝚀𝚁𝚂𝚃𝚄𝚅𝚆𝚇𝚈𝚉𝚊𝚋𝚌𝚍𝚎𝚏𝚐𝚑𝚒𝚓𝚔𝚕𝚖𝚗𝚘𝚙𝚚𝚛𝚜𝚝𝚞𝚟𝚠𝚡𝚢𝚣𝟶𝟷𝟸𝟹𝟺𝟻𝟼𝟽𝟾𝟿"+
                   "𝘼𝘽𝘾𝘿𝙀𝙁𝙂𝙃𝙄𝙅𝙆𝙇𝙈𝙉𝙊𝙋𝙌𝙍𝙎𝙏𝙐𝙑𝙒𝙓𝙔𝙕𝙖𝙗𝙘𝙙𝙚𝙛𝙜𝙝𝙞𝙟𝙠𝙡𝙢𝙣𝙤𝙥𝙦𝙧𝙨𝙩𝙪𝙫𝙬𝙭𝙮𝙯"+
                   "𝛢𝛼𝛣𝛽𝛤𝛾Δ𝛥𝛿𝛦ϵε𝛧𝜁𝛨𝜂Θ𝜃𝜗𝛪𝜄𝛫𝜅𝜘𝛬𝜆𝛭𝜇𝛮𝜈Φ𝜙𝜑Ξ𝜉𝛰𝜊𝛱𝜋𝜛𝛲𝜌ϱ𝛴𝜎𝜍𝛵𝜏𝛶𝜐𝛸𝜒𝛹𝜓Ω𝜔"+
                   "𝜜𝜶𝜝𝜷𝜞𝜸𝚫𝜟𝜹𝜠𝛜𝛆𝜡𝜻𝜢𝜼𝚽𝜽𝝑𝜤𝜾𝜥𝜿𝝒𝜦𝝀𝜧𝝁𝜨𝝂𝚽𝝓𝝋𝚵𝝃𝜪𝝄𝜫𝝅𝝕𝜬𝝆𝛠𝜮𝛔𝝇𝜯𝝉𝜰𝝊𝜲𝝌𝜳𝝍𝛀𝝎"+ 
                   "ΑαΒβΓγδΖζΗηθϑΙιΚκϰΛλΜμΝνξΟοΠπϖΡρϱΣσςΤτΥυϕφΧχΨψΩω" + 
                   "𝝖𝝰𝝗𝝱𝝘𝝲𝛅𝝛𝝵𝝜𝝶𝛉𝛝𝝞𝛊𝝟𝝹𝞌𝝠𝝺𝝡𝝻𝝢𝝼𝝽𝝤𝝾𝝥𝝿𝞏𝝦𝞀𝞎𝝨𝞂𝞁𝝩𝞃𝝪𝞄𝞍𝞅𝝬𝞆𝝭𝞇𝝮𝞈" +
                   "ℾℽℿℼ⅀" + 
                   ")]}⦆⟧⦄";  // Only right parentheses, since the algorithm to adjust spaces only looks at the previous symbol

/** Functions (as const) **/

const mathbb = (arg, initialCommand) => {
    // mathbb stands for math blackboard-bold
    // This function converts the list of characters to the corresponding blackboard-bold character
    const symbols = {
        "A" : "\u{1D538}",
        "B" : "\u{1D539}",
        "C" : "\u2102",
        "D" : "\u{1D53B}",
        "E" : "\u{1D53C}",
        "F" : "\u{1D53D}",
        "G" : "\u{1D53E}",
        "H" : "\u210D",
        "I" : "\u{1D540}",
        "J" : "\u{1D541}",
        "K" : "\u{1D542}",
        "L" : "\u{1D543}",
        "M" : "\u{1D544}",
        "N" : "\u2115",
        "O" : "\u{1D546}",
        "P" : "\u2119",
        "Q" : "\u211A",
        "R" : "\u211D",
        "S" : "\u{1D54A}",
        "T" : "\u{1D54B}",
        "U" : "\u{1D54C}",
        "V" : "\u{1D54D}",
        "W" : "\u{1D54E}",
        "X" : "\u{1D54F}",
        "Y" : "\u{1D550}",
        "Z" : "\u2124",
        "a" : "\u{1D552}",
        "b" : "\u{1D553}",
        "c" : "\u{1D554}",
        "d" : "\u{1D555}",
        "e" : "\u{1D556}",
        "f" : "\u{1D557}",
        "g" : "\u{1D558}",
        "h" : "\u{1D559}",
        "i" : "\u{1D55A}",
        "j" : "\u{1D55B}",
        "k" : "\u{1D55C}",
        "l" : "\u{1D55D}",
        "m" : "\u{1D55E}",
        "n" : "\u{1D55F}",
        "o" : "\u{1D560}",
        "p" : "\u{1D561}",
        "q" : "\u{1D562}",
        "r" : "\u{1D563}",
        "s" : "\u{1D564}",
        "t" : "\u{1D565}",
        "u" : "\u{1D566}",
        "v" : "\u{1D567}",
        "w" : "\u{1D568}",
        "x" : "\u{1D569}",
        "y" : "\u{1D56A}",
        "z" : "\u{1D56B}",

        "𝐴" : "\u{1D538}",
        "𝐵" : "\u{1D539}",
        "𝐶" : "\u2102",
        "𝐷" : "\u{1D53B}",
        "𝐸" : "\u{1D53C}",
        "𝐹" : "\u{1D53D}",
        "𝐺" : "\u{1D53E}",
        "𝐻" : "\u210D",
        "𝐼" : "\u{1D540}",
        "𝐽" : "\u{1D541}",
        "𝐾" : "\u{1D542}",
        "𝐿" : "\u{1D543}",
        "𝑀" : "\u{1D544}",
        "𝑁" : "\u2115",
        "𝑂" : "\u{1D546}",
        "𝑃" : "\u2119",
        "𝑄" : "\u211A",
        "𝑅" : "\u211D",
        "𝑆" : "\u{1D54A}",
        "𝑇" : "\u{1D54B}",
        "𝑈" : "\u{1D54C}",
        "𝑉" : "\u{1D54D}",
        "𝑊" : "\u{1D54E}",
        "𝑋" : "\u{1D54F}",
        "𝑌" : "\u{1D550}",
        "𝑍" : "\u2124",
        "𝑎" : "\u{1D552}",
        "𝑏" : "\u{1D553}",
        "𝑐" : "\u{1D554}",
        "𝑑" : "\u{1D555}",
        "𝑒" : "\u{1D556}",
        "𝑓" : "\u{1D557}",
        "𝑔" : "\u{1D558}",
        "ℎ" : "\u{1D559}",
        "𝑖" : "\u{1D55A}",
        "𝑗" : "\u{1D55B}",
        "𝑘" : "\u{1D55C}",
        "𝑙" : "\u{1D55D}",
        "𝑚" : "\u{1D55E}",
        "𝑛" : "\u{1D55F}",
        "𝑜" : "\u{1D560}",
        "𝑝" : "\u{1D561}",
        "𝑞" : "\u{1D562}",
        "𝑟" : "\u{1D563}",
        "𝑠" : "\u{1D564}",
        "𝑡" : "\u{1D565}",
        "𝑢" : "\u{1D566}",
        "𝑣" : "\u{1D567}",
        "𝑤" : "\u{1D568}",
        "𝑥" : "\u{1D569}",
        "𝑦" : "\u{1D56A}",
        "𝑧" : "\u{1D56B}",
        
        "𝛾" : "\u213D",
        "𝛤" : "\u213E",
        "𝛱" : "\u213F",
        "𝜋" : "\u213C",
        "𝛴" : "\u2140",
        "Σ" : "\u2140",
        "Π" : "\u213F",
        "π" : "\u213C",
        "γ" : "\u213D",
        "Γ" : "\u213E",

        "0" : "\u{1D7D8}",
        "1" : "\u{1D7D9}",
        "2" : "\u{1D7DA}",
        "3" : "\u{1D7DB}",
        "4" : "\u{1D7DC}",
        "5" : "\u{1D7DD}",
        "6" : "\u{1D7DE}",
        "7" : "\u{1D7DF}",
        "8" : "\u{1D7E0}",
        "9" : "\u{1D7E1}",

        "(" : "⦅",
        "{" : "⦃",
        "[" : "⟦",
        "]" : "⟧",
        "}" : "⦄",
        ")" : "⦆",

        // Spaces (\:, \;, \quad and \qquad are passed as a single character in mistakes) 
        "\u2710" : spacesChar.add,
        "\u2710\u2710" : spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add+spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : " ",
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const mathbf = (arg, initialCommand) => {
    // mathbf stands for math bold font
    // This function converts the list of characters to the corresponding bold font character
    const symbols = {
        "A" : "\u{1D468}",
        "a" : "\u{1D482}",
        "B" : "\u{1D469}",
        "b" : "\u{1D483}",
        "C" : "\u{1D46A}",
        "c" : "\u{1D484}",
        "D" : "\u{1D46B}",
        "d" : "\u{1D485}",
        "E" : "\u{1D46C}",
        "e" : "\u{1D486}",
        "F" : "\u{1D46D}",
        "f" : "\u{1D487}",
        "G" : "\u{1D46E}",
        "g" : "\u{1D488}",
        "H" : "\u{1D46F}",
        "h" : "\u{1D489}",
        "I" : "\u{1D470}",
        "i" : "\u{1D48A}",
        "J" : "\u{1D471}",
        "j" : "\u{1D48B}",
        "K" : "\u{1D472}",
        "k" : "\u{1D48C}",
        "L" : "\u{1D473}",
        "l" : "\u{1D48D}",
        "M" : "\u{1D474}",
        "m" : "\u{1D48E}",
        "N" : "\u{1D475}",
        "n" : "\u{1D48F}",
        "O" : "\u{1D476}",
        "o" : "\u{1D490}",
        "P" : "\u{1D477}",
        "p" : "\u{1D491}",
        "Q" : "\u{1D478}",
        "q" : "\u{1D492}",
        "R" : "\u{1D479}",
        "r" : "\u{1D493}",
        "S" : "\u{1D47A}",
        "s" : "\u{1D494}",
        "T" : "\u{1D47B}",
        "t" : "\u{1D495}",
        "U" : "\u{1D47C}",
        "u" : "\u{1D496}",
        "V" : "\u{1D47D}",
        "v" : "\u{1D497}",
        "W" : "\u{1D47E}",
        "w" : "\u{1D498}",
        "X" : "\u{1D47F}",
        "x" : "\u{1D499}",
        "Y" : "\u{1D480}",
        "y" : "\u{1D49A}",
        "Z" : "\u{1D481}",
        "z" : "\u{1D49B}",

        "𝐴" : "\u{1D468}",
        "𝑎" : "\u{1D482}",
        "𝐵" : "\u{1D469}",
        "𝑏" : "\u{1D483}",
        "𝐶" : "\u{1D46A}",
        "𝑐" : "\u{1D484}",
        "𝐷" : "\u{1D46B}",
        "𝑑" : "\u{1D485}",
        "𝐸" : "\u{1D46C}",
        "𝑒" : "\u{1D486}",
        "𝐹" : "\u{1D46D}",
        "𝑓" : "\u{1D487}",
        "𝐺" : "\u{1D46E}",
        "𝑔" : "\u{1D488}",
        "𝐻" : "\u{1D46F}",
        "ℎ" : "\u{1D489}",
        "𝐼" : "\u{1D470}",
        "𝑖" : "\u{1D48A}",
        "𝐽" : "\u{1D471}",
        "𝑗" : "\u{1D48B}",
        "𝐾" : "\u{1D472}",
        "𝑘" : "\u{1D48C}",
        "𝐿" : "\u{1D473}",
        "𝑙" : "\u{1D48D}",
        "𝑀" : "\u{1D474}",
        "𝑚" : "\u{1D48E}",
        "𝑁" : "\u{1D475}",
        "𝑛" : "\u{1D48F}",
        "𝑂" : "\u{1D476}",
        "𝑜" : "\u{1D490}",
        "𝑃" : "\u{1D477}",
        "𝑝" : "\u{1D491}",
        "𝑄" : "\u{1D478}",
        "𝑞" : "\u{1D492}",
        "𝑅" : "\u{1D479}",
        "𝑟" : "\u{1D493}",
        "𝑆" : "\u{1D47A}",
        "𝑠" : "\u{1D494}",
        "𝑇" : "\u{1D47B}",
        "𝑡" : "\u{1D495}",
        "𝑈" : "\u{1D47C}",
        "𝑢" : "\u{1D496}",
        "𝑉" : "\u{1D47D}",
        "𝑣" : "\u{1D497}",
        "𝑊" : "\u{1D47E}",
        "𝑤" : "\u{1D498}",
        "𝑋" : "\u{1D47F}",
        "𝑥" : "\u{1D499}",
        "𝑌" : "\u{1D480}",
        "𝑦" : "\u{1D49A}",
        "𝑍" : "\u{1D481}",
        "𝑧" : "\u{1D49B}",

        "0" : "\u{1D7CE}",
        "1" : "\u{1D7CF}",
        "2" : "\u{1D7D0}",
        "3" : "\u{1D7D1}",
        "4" : "\u{1D7D2}",
        "5" : "\u{1D7D3}",
        "6" : "\u{1D7D4}",
        "7" : "\u{1D7D5}",
        "8" : "\u{1D7D6}",
        "9" : "\u{1D7D7}",

        "∂" : "\u{1D789}",

        // Greek
        "𝛢" : "\u{1D71C}",
        "𝛼" : "\u{1D736}",
        "𝛣" : "\u{1D71D}",
        "𝛽" : "\u{1D737}",
        "𝛤" : "\u{1D71E}",
        "𝛾" : "\u{1D738}",
        "Δ" : "\u{1D6AB}",
        "𝛥" : "\u{1D71F}",
        "𝛿" : "\u{1D739}",
        "𝛦" : "\u{1D720}",
        "ϵ" : "\u{1D6DC}",
        "ε" : "\u{1D6C6}",
        "𝛧" : "\u{1D721}",
        "𝜁" : "\u{1D73B}",
        "𝛨" : "\u{1D722}",
        "𝜂" : "\u{1D73C}",
        "Θ" : "\u{1D6BD}",
        "𝜃" : "\u{1D73D}",
        "𝜗" : "\u{1D751}",
        "𝛪" : "\u{1D724}",
        "𝜄" : "\u{1D73E}",
        "𝛫" : "\u{1D725}",
        "𝜅" : "\u{1D73F}",
        "𝜘" : "\u{1D752}",
        "𝛬" : "\u{1D726}",
        "𝜆" : "\u{1D740}",
        "𝛭" : "\u{1D727}",
        "𝜇" : "\u{1D741}",
        "𝛮" : "\u{1D728}",
        "𝜈" : "\u{1D742}",
        "Ξ" : "\u{1D6B5}",
        "𝜉" : "\u{1D743}",
        "𝛰" : "\u{1D72A}",
        "𝜊" : "\u{1D744}",
        "𝛱" : "\u{1D72B}",
        "𝜋" : "\u{1D745}",
        "𝜛" : "\u{1D755}",
        "𝛲" : "\u{1D72C}",
        "𝜌" : "\u{1D746}",
        "𝜚" : "\u{1D754}",
        "𝛴" : "\u{1D72E}",
        "𝜎" : "\u{1D748}",
        "𝜍" : "\u{1D747}",
        "𝛵" : "\u{1D72F}",
        "𝜏" : "\u{1D749}",
        "𝛶" : "\u{1D730}",
        "𝜐" : "\u{1D74A}",
        "Φ" : "\u{1D6BD}",
        "𝜙" : "\u{1D753}",
        "𝜑" : "\u{1D74B}",
        "𝛸" : "\u{1D732}",
        "𝜒" : "\u{1D74C}",
        "𝛹" : "\u{1D733}",
        "𝜓" : "\u{1D74D}",
        "Ω" : "\u{1D6C0}",
        "𝜔" : "\u{1D74E}",

        "Α" : "\u{1D756}",
        "α" : "\u{1D770}",
        "Β" : "\u{1D757}",
        "β" : "\u{1D771}",
        "Γ" : "\u{1D758}",
        "γ" : "\u{1D772}",
        "δ" : "\u{1D6C5}",
        "Ε" : "\u{1D75A}",
        "Ζ" : "\u{1D75B}",
        "ζ" : "\u{1D775}",
        "Η" : "\u{1D75C}",
        "η" : "\u{1D776}",
        "θ" : "\u{1D6C9}",
        "ϑ" : "\u{1D6DD}",
        "Ι" : "\u{1D75E}",
        "ι" : "\u{1D6CA}",
        "Κ" : "\u{1D75F}",
        "κ" : "\u{1D779}",
        "ϰ" : "\u{1D78C}",
        "Λ" : "\u{1D760}",
        "λ" : "\u{1D77A}",
        "Μ" : "\u{1D761}",
        "μ" : "\u{1D77B}",
        "Ν" : "\u{1D762}",
        "ν" : "\u{1D77C}",
        "ξ" : "\u{1D77D}",
        "Ο" : "\u{1D764}",
        "ο" : "\u{1D77E}",
        "Π" : "\u{1D765}",
        "π" : "\u{1D77F}",
        "ϖ" : "\u{1D78F}",
        "Ρ" : "\u{1D766}",
        "ρ" : "\u{1D780}",
        "ϱ" : "\u{1D78E}",
        "Σ" : "\u{1D768}",
        "σ" : "\u{1D782}",
        "ς" : "\u{1D781}",
        "Τ" : "\u{1D769}",
        "τ" : "\u{1D783}",
        "Υ" : "\u{1D76A}",
        "υ" : "\u{1D784}",
        "ϕ" : "\u{1D78D}",
        "φ" : "\u{1D785}",
        "Χ" : "\u{1D76C}",
        "χ" : "\u{1D786}",
        "Ψ" : "\u{1D76D}",
        "ψ" : "\u{1D787}",
        "Ω" : "\u{1D76E}",
        "ω" : "\u{1D788}",

        // mathcal
        "𝒜" : "\u{1D4D0}",
        "𝒶" : "\u{1D4EA}",
        "ℬ" : "\u{1D4D1}",
        "𝒷" : "\u{1D4EB}",
        "𝒞" : "\u{1D4D2}",
        "𝒸" : "\u{1D4EC}",
        "𝒟" : "\u{1D4D3}",
        "𝒹" : "\u{1D4ED}",
        "ℰ" : "\u{1D4D4}",
        "ℯ" : "\u{1D4EE}",
        "ℱ" : "\u{1D4D5}",
        "𝒻" : "\u{1D4EF}",
        "𝒢" : "\u{1D4D6}",
        "ℊ" : "\u{1D4F0}",
        "ℋ" : "\u{1D4D7}",
        "𝒽" : "\u{1D4F1}",
        "ℐ" : "\u{1D4D8}",
        "𝒾" : "\u{1D4F2}",
        "𝒥" : "\u{1D4D9}",
        "𝒿" : "\u{1D4F3}",
        "𝒦" : "\u{1D4DA}",
        "𝓀" : "\u{1D4F4}",
        "ℒ" : "\u{1D4DB}",
        "𝓁" : "\u{1D4F5}",
        "ℳ" : "\u{1D4DC}",
        "𝓂" : "\u{1D4F6}",
        "𝒩" : "\u{1D4DD}",
        "𝓃" : "\u{1D4F7}",
        "𝒪" : "\u{1D4DE}",
        "ℴ" : "\u{1D4F8}",
        "𝒫" : "\u{1D4DF}",
        "𝓅" : "\u{1D4F9}",
        "𝒬" : "\u{1D4E0}",
        "𝓆" : "\u{1D4FA}",
        "ℛ" : "\u{1D4E1}",
        "𝓇" : "\u{1D4FB}",
        "𝒮" : "\u{1D4E2}",
        "𝓈" : "\u{1D4FC}",
        "𝒯" : "\u{1D4E3}",
        "𝓉" : "\u{1D4FD}",
        "𝒰" : "\u{1D4E4}",
        "𝓊" : "\u{1D4FE}",
        "𝒱" : "\u{1D4E5}",
        "𝓋" : "\u{1D4FF}",
        "𝒲" : "\u{1D4E6}",
        "𝓌" : "\u{1D500}",
        "𝒳" : "\u{1D4E7}",
        "𝓍" : "\u{1D501}",
        "𝒴" : "\u{1D4E8}",
        "𝓎" : "\u{1D502}",
        "𝒵" : "\u{1D4E9}",
        "𝓏" : "\u{1D503}",

        // mathfrak
        "𝔄" : "\u{1D56C}",
        "𝔞" : "\u{1D586}",
        "𝔅" : "\u{1D56D}",
        "𝔟" : "\u{1D587}",
        "ℭ" : "\u{1D56E}",
        "𝔠" : "\u{1D588}",
        "𝔇" : "\u{1D56F}",
        "𝔡" : "\u{1D589}",
        "𝔈" : "\u{1D570}",
        "𝔢" : "\u{1D58A}",
        "𝔉" : "\u{1D571}",
        "𝔣" : "\u{1D58B}",
        "𝔊" : "\u{1D572}",
        "𝔤" : "\u{1D58C}",
        "ℌ" : "\u{1D573}",
        "𝔥" : "\u{1D58D}",
        "ℑ" : "\u{1D574}",
        "𝔦" : "\u{1D58E}",
        "𝔍" : "\u{1D575}",
        "𝔧" : "\u{1D58F}",
        "𝔎" : "\u{1D576}",
        "𝔨" : "\u{1D590}",
        "𝔏" : "\u{1D577}",
        "𝔩" : "\u{1D591}",
        "𝔐" : "\u{1D578}",
        "𝔪" : "\u{1D592}",
        "𝔑" : "\u{1D579}",
        "𝔫" : "\u{1D593}",
        "𝔒" : "\u{1D57A}",
        "𝔬" : "\u{1D594}",
        "𝔓" : "\u{1D57B}",
        "𝔭" : "\u{1D595}",
        "𝔔" : "\u{1D57C}",
        "𝔮" : "\u{1D596}",
        "ℜ" : "\u{1D57D}",
        "𝔯" : "\u{1D597}",
        "𝔖" : "\u{1D57E}",
        "𝔰" : "\u{1D598}",
        "𝔗" : "\u{1D57F}",
        "𝔱" : "\u{1D599}",
        "𝔘" : "\u{1D580}",
        "𝔲" : "\u{1D59A}",
        "𝔙" : "\u{1D581}",
        "𝔳" : "\u{1D59B}",
        "𝔚" : "\u{1D582}",
        "𝔴" : "\u{1D59C}",
        "𝔛" : "\u{1D583}",
        "𝔵" : "\u{1D59D}",
        "𝔜" : "\u{1D584}",
        "𝔶" : "\u{1D59E}",
        "ℨ" : "\u{1D585}",
        "𝔷" : "\u{1D59F}",

        // Spaces (\:, \;, \quad and \qquad are passed as a single character in mistakes) 
        "\u2710" : spacesChar.add,
        "\u2710\u2710" : spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add+spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : " ",
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const mathcal = (arg, initialCommand) => {
    // mathcal stands for math calligraphic
    // This function converts the list of characters to the corresponding calligraphic character
    const symbols = {
        "A" : "\u{1D49C}",
        "a" : "\u{1D4B6}",
        "B" : "\u212C",
        "b" : "\u{1D4B7}",
        "C" : "\u{1D49E}",
        "c" : "\u{1D4B8}",
        "D" : "\u{1D49F}",
        "d" : "\u{1D4B9}",
        "E" : "\u2130",
        "e" : "\u212F",
        "F" : "\u2131",
        "f" : "\u{1D4BB}",
        "G" : "\u{1D4A2}",
        "g" : "\u210A",
        "H" : "\u210B",
        "h" : "\u{1D4BD}",
        "I" : "\u2110",
        "i" : "\u{1D4BE}",
        "J" : "\u{1D4A5}",
        "j" : "\u{1D4BF}",
        "K" : "\u{1D4A6}",
        "k" : "\u{1D4C0}",
        "L" : "\u2112",
        "l" : "\u{1D4C1}",
        "M" : "\u2133",
        "m" : "\u{1D4C2}",
        "N" : "\u{1D4A9}",
        "n" : "\u{1D4C3}",
        "O" : "\u{1D4AA}",
        "o" : "\u2134",
        "P" : "\u{1D4AB}",
        "p" : "\u{1D4C5}",
        "Q" : "\u{1D4AC}",
        "q" : "\u{1D4C6}",
        "R" : "\u211B",
        "r" : "\u{1D4C7}",
        "S" : "\u{1D4AE}",
        "s" : "\u{1D4C8}",
        "T" : "\u{1D4AF}",
        "t" : "\u{1D4C9}",
        "U" : "\u{1D4B0}",
        "u" : "\u{1D4CA}",
        "V" : "\u{1D4B1}",
        "v" : "\u{1D4CB}",
        "W" : "\u{1D4B2}",
        "w" : "\u{1D4CC}",
        "X" : "\u{1D4B3}",
        "x" : "\u{1D4CD}",
        "Y" : "\u{1D4B4}",
        "y" : "\u{1D4CE}",
        "Z" : "\u{1D4B5}",
        "z" : "\u{1D4CF}",

        "𝐴" : "\u{1D49C}",
        "𝑎" : "\u{1D4B6}",
        "𝐵" : "\u212C",
        "𝑏" : "\u{1D4B7}",
        "𝐶" : "\u{1D49E}",
        "𝑐" : "\u{1D4B8}",
        "𝐷" : "\u{1D49F}",
        "𝑑" : "\u{1D4B9}",
        "𝐸" : "\u2130",
        "𝑒" : "\u212F",
        "𝐹" : "\u2131",
        "𝑓" : "\u{1D4BB}",
        "𝐺" : "\u{1D4A2}",
        "𝑔" : "\u210A",
        "𝐻" : "\u210B",
        "ℎ" : "\u{1D4BD}",
        "𝐼" : "\u2110",
        "𝑖" : "\u{1D4BE}",
        "𝐽" : "\u{1D4A5}",
        "𝑗" : "\u{1D4BF}",
        "𝐾" : "\u{1D4A6}",
        "𝑘" : "\u{1D4C0}",
        "𝐿" : "\u2112",
        "𝑙" : "\u{1D4C1}",
        "𝑀" : "\u2133",
        "𝑚" : "\u{1D4C2}",
        "𝑁" : "\u{1D4A9}",
        "𝑛" : "\u{1D4C3}",
        "𝑂" : "\u{1D4AA}",
        "𝑜" : "\u2134",
        "𝑃" : "\u{1D4AB}",
        "𝑝" : "\u{1D4C5}",
        "𝑄" : "\u{1D4AC}",
        "𝑞" : "\u{1D4C6}",
        "𝑅" : "\u211B",
        "𝑟" : "\u{1D4C7}",
        "𝑆" : "\u{1D4AE}",
        "𝑠" : "\u{1D4C8}",
        "𝑇" : "\u{1D4AF}",
        "𝑡" : "\u{1D4C9}",
        "𝑈" : "\u{1D4B0}",
        "𝑢" : "\u{1D4CA}",
        "𝑉" : "\u{1D4B1}",
        "𝑣" : "\u{1D4CB}",
        "𝑊" : "\u{1D4B2}",
        "𝑤" : "\u{1D4CC}",
        "𝑋" : "\u{1D4B3}",
        "𝑥" : "\u{1D4CD}",
        "𝑌" : "\u{1D4B4}",
        "𝑦" : "\u{1D4CE}",
        "𝑍" : "\u{1D4B5}",
        "𝑧" : "\u{1D4CF}",

        "𝑨" : "\u{1D4D0}",
        "𝒂" : "\u{1D4EA}",
        "𝑩" : "\u{1D4D1}",
        "𝒃" : "\u{1D4EB}",
        "𝑪" : "\u{1D4D2}",
        "𝒄" : "\u{1D4EC}",
        "𝑫" : "\u{1D4D3}",
        "𝒅" : "\u{1D4ED}",
        "𝑬" : "\u{1D4D4}",
        "𝒆" : "\u{1D4EE}",
        "𝑭" : "\u{1D4D5}",
        "𝒇" : "\u{1D4EF}",
        "𝑮" : "\u{1D4D6}",
        "𝒈" : "\u{1D4F0}",
        "𝑯" : "\u{1D4D7}",
        "𝒉" : "\u{1D4F1}",
        "𝑰" : "\u{1D4D8}",
        "𝒊" : "\u{1D4F2}",
        "𝑱" : "\u{1D4D9}",
        "𝒋" : "\u{1D4F3}",
        "𝑲" : "\u{1D4DA}",
        "𝒌" : "\u{1D4F4}",
        "𝑳" : "\u{1D4DB}",
        "𝒍" : "\u{1D4F5}",
        "𝑴" : "\u{1D4DC}",
        "𝒎" : "\u{1D4F6}",
        "𝑵" : "\u{1D4DD}",
        "𝒏" : "\u{1D4F7}",
        "𝑶" : "\u{1D4DE}",
        "𝒐" : "\u{1D4F8}",
        "𝑷" : "\u{1D4DF}",
        "𝒑" : "\u{1D4F9}",
        "𝑸" : "\u{1D4E0}",
        "𝒒" : "\u{1D4FA}",
        "𝑹" : "\u{1D4E1}",
        "𝒓" : "\u{1D4FB}",
        "𝑺" : "\u{1D4E2}",
        "𝒔" : "\u{1D4FC}",
        "𝑻" : "\u{1D4E3}",
        "𝒕" : "\u{1D4FD}",
        "𝑼" : "\u{1D4E4}",
        "𝒖" : "\u{1D4FE}",
        "𝑽" : "\u{1D4E5}",
        "𝒗" : "\u{1D4FF}",
        "𝑾" : "\u{1D4E6}",
        "𝒘" : "\u{1D500}",
        "𝑿" : "\u{1D4E7}",
        "𝒙" : "\u{1D501}",
        "𝒀" : "\u{1D4E8}",
        "𝒚" : "\u{1D502}",
        "𝒁" : "\u{1D4E9}",
        "𝒛" : "\u{1D503}",

        // Spaces (\:, \;, \quad and \qquad are passed as a single character in mistakes) 
        "\u2710" : spacesChar.add,
        "\u2710\u2710" : spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add+spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : " ",
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const mathfrak = (arg, initialCommand) => {
    // mathfrak stands for math fraktur
    // This function converts the list of characters to the corresponding fraktur character
    const symbols = {
        "A" : "\u{1D504}",
        "a" : "\u{1D51E}",
        "B" : "\u{1D505}",
        "b" : "\u{1D51F}",
        "C" : "\u212D",
        "c" : "\u{1D520}",
        "D" : "\u{1D507}",
        "d" : "\u{1D521}",
        "E" : "\u{1D508}",
        "e" : "\u{1D522}",
        "F" : "\u{1D509}",
        "f" : "\u{1D523}",
        "G" : "\u{1D50A}",
        "g" : "\u{1D524}",
        "H" : "\u210C",
        "h" : "\u{1D525}",
        "I" : "\u2111",
        "i" : "\u{1D526}",
        "J" : "\u{1D50D}",
        "j" : "\u{1D527}",
        "K" : "\u{1D50E}",
        "k" : "\u{1D528}",
        "L" : "\u{1D50F}",
        "l" : "\u{1D529}",
        "M" : "\u{1D510}",
        "m" : "\u{1D52A}",
        "N" : "\u{1D511}",
        "n" : "\u{1D52B}",
        "O" : "\u{1D512}",
        "o" : "\u{1D52C}",
        "P" : "\u{1D513}",
        "p" : "\u{1D52D}",
        "Q" : "\u{1D514}",
        "q" : "\u{1D52E}",
        "R" : "\u211C",
        "r" : "\u{1D52F}",
        "S" : "\u{1D516}",
        "s" : "\u{1D530}",
        "T" : "\u{1D517}",
        "t" : "\u{1D531}",
        "U" : "\u{1D518}",
        "u" : "\u{1D532}",
        "V" : "\u{1D519}",
        "v" : "\u{1D533}",
        "W" : "\u{1D51A}",
        "w" : "\u{1D534}",
        "X" : "\u{1D51B}",
        "x" : "\u{1D535}",
        "Y" : "\u{1D51C}",
        "y" : "\u{1D536}",
        "Z" : "\u2128",
        "z" : "\u{1D537}",

        "𝐴" : "\u{1D504}",
        "𝑎" : "\u{1D51E}",
        "𝐵" : "\u{1D505}",
        "𝑏" : "\u{1D51F}",
        "𝐶" : "\u212D",
        "𝑐" : "\u{1D520}",
        "𝐷" : "\u{1D507}",
        "𝑑" : "\u{1D521}",
        "𝐸" : "\u{1D508}",
        "𝑒" : "\u{1D522}",
        "𝐹" : "\u{1D509}",
        "𝑓" : "\u{1D523}",
        "𝐺" : "\u{1D50A}",
        "𝑔" : "\u{1D524}",
        "𝐻" : "\u210C",
        "ℎ" : "\u{1D525}",
        "𝐼" : "\u2111",
        "𝑖" : "\u{1D526}",
        "𝐽" : "\u{1D50D}",
        "𝑗" : "\u{1D527}",
        "𝐾" : "\u{1D50E}",
        "𝑘" : "\u{1D528}",
        "𝐿" : "\u{1D50F}",
        "𝑙" : "\u{1D529}",
        "𝑀" : "\u{1D510}",
        "𝑚" : "\u{1D52A}",
        "𝑁" : "\u{1D511}",
        "𝑛" : "\u{1D52B}",
        "𝑂" : "\u{1D512}",
        "𝑜" : "\u{1D52C}",
        "𝑃" : "\u{1D513}",
        "𝑝" : "\u{1D52D}",
        "𝑄" : "\u{1D514}",
        "𝑞" : "\u{1D52E}",
        "𝑅" : "\u211C",
        "𝑟" : "\u{1D52F}",
        "𝑆" : "\u{1D516}",
        "𝑠" : "\u{1D530}",
        "𝑇" : "\u{1D517}",
        "𝑡" : "\u{1D531}",
        "𝑈" : "\u{1D518}",
        "𝑢" : "\u{1D532}",
        "𝑉" : "\u{1D519}",
        "𝑣" : "\u{1D533}",
        "𝑊" : "\u{1D51A}",
        "𝑤" : "\u{1D534}",
        "𝑋" : "\u{1D51B}",
        "𝑥" : "\u{1D535}",
        "𝑌" : "\u{1D51C}",
        "𝑦" : "\u{1D536}",
        "𝑍" : "\u2128",
        "𝑧" : "\u{1D537}",

        "𝑨" : "\u{1D56C}",
        "𝒂" : "\u{1D586}",
        "𝑩" : "\u{1D56D}",
        "𝒃" : "\u{1D587}",
        "𝑪" : "\u{1D56E}",
        "𝒄" : "\u{1D588}",
        "𝑫" : "\u{1D56F}",
        "𝒅" : "\u{1D589}",
        "𝑬" : "\u{1D570}",
        "𝒆" : "\u{1D58A}",
        "𝑭" : "\u{1D571}",
        "𝒇" : "\u{1D58B}",
        "𝑮" : "\u{1D572}",
        "𝒈" : "\u{1D58C}",
        "𝑯" : "\u{1D573}",
        "𝒉" : "\u{1D58D}",
        "𝑰" : "\u{1D574}",
        "𝒊" : "\u{1D58E}",
        "𝑱" : "\u{1D575}",
        "𝒋" : "\u{1D58F}",
        "𝑲" : "\u{1D576}",
        "𝒌" : "\u{1D590}",
        "𝑳" : "\u{1D577}",
        "𝒍" : "\u{1D591}",
        "𝑴" : "\u{1D578}",
        "𝒎" : "\u{1D592}",
        "𝑵" : "\u{1D579}",
        "𝒏" : "\u{1D593}",
        "𝑶" : "\u{1D57A}",
        "𝒐" : "\u{1D594}",
        "𝑷" : "\u{1D57B}",
        "𝒑" : "\u{1D595}",
        "𝑸" : "\u{1D57C}",
        "𝒒" : "\u{1D596}",
        "𝑹" : "\u{1D57D}",
        "𝒓" : "\u{1D597}",
        "𝑺" : "\u{1D57E}",
        "𝒔" : "\u{1D598}",
        "𝑻" : "\u{1D57F}",
        "𝒕" : "\u{1D599}",
        "𝑼" : "\u{1D580}",
        "𝒖" : "\u{1D59A}",
        "𝑽" : "\u{1D581}",
        "𝒗" : "\u{1D59B}",
        "𝑾" : "\u{1D582}",
        "𝒘" : "\u{1D59C}",
        "𝑿" : "\u{1D583}",
        "𝒙" : "\u{1D59D}",
        "𝒀" : "\u{1D584}",
        "𝒚" : "\u{1D59E}",
        "𝒁" : "\u{1D585}",
        "𝒛" : "\u{1D59F}",

        // Spaces (\:, \;, \quad and \qquad are passed as a single character in mistakes) 
        "\u2710" : spacesChar.add,
        "\u2710\u2710" : spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add,
        "\u2710\u2710\u2710\u2710" : spacesChar.add+spacesChar.add+spacesChar.add+spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : " ",
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const superscript = (arg, initialCommand, forFrac=false) => {
    // Sends input to be converted by replaceLetters
    // This function is by default not called by the frac function
    let output = replaceLetters(arg[0], Superscript, initialCommand, !forFrac);
    if (((!hasFailure(output)) && (output.filter(e => accents[e] !== undefined).length === 0)) || (forFrac)) {
        return output.concat(extraArgs(arg.slice(1), initialCommand));
    } else {
        return ["^{" + arg[0].join("") + "}"].concat(extraArgs(arg.slice(1), initialCommand));
    };
};

const subscript = (arg, initialCommand, forFrac=false) => {
    // Sends input to be converted by replaceLetters
    // This function is by default not called by the frac function
    let output = replaceLetters(arg[0], Subscript, initialCommand, !forFrac);
    if (((!hasFailure(output)) && (output.filter(e => accents[e] !== undefined).length === 0)) || (forFrac)) {
        return output.concat(extraArgs(arg.slice(1), initialCommand));
    } else {
        return ["_{" + arg[0].join("") + "}"].concat(extraArgs(arg.slice(1), initialCommand));
    };
};

const textbf = (arg, initialCommand) => {
    // textbf stands for text bold font
    // This function converts the list of characters to the corresponding (text) bold font character
	const symbols = {
        "A" : "\u{1D5D4}",
        "a" : "\u{1D5EE}",
        "B" : "\u{1D5D5}",
        "b" : "\u{1D5EF}",
        "C" : "\u{1D5D6}",
        "c" : "\u{1D5F0}",
        "D" : "\u{1D5D7}",
        "d" : "\u{1D5F1}",
        "E" : "\u{1D5D8}",
        "e" : "\u{1D5F2}",
        "F" : "\u{1D5D9}",
        "f" : "\u{1D5F3}",
        "G" : "\u{1D5DA}",
        "g" : "\u{1D5F4}",
        "H" : "\u{1D5DB}",
        "h" : "\u{1D5F5}",
        "I" : "\u{1D5DC}",
        "i" : "\u{1D5F6}",
        "J" : "\u{1D5DD}",
        "j" : "\u{1D5F7}",
        "K" : "\u{1D5DE}",
        "k" : "\u{1D5F8}",
        "L" : "\u{1D5DF}",
        "l" : "\u{1D5F9}",
        "M" : "\u{1D5E0}",
        "m" : "\u{1D5FA}",
        "N" : "\u{1D5E1}",
        "n" : "\u{1D5FB}",
        "O" : "\u{1D5E2}",
        "o" : "\u{1D5FC}",
        "P" : "\u{1D5E3}",
        "p" : "\u{1D5FD}",
        "Q" : "\u{1D5E4}",
        "q" : "\u{1D5FE}",
        "R" : "\u{1D5E5}",
        "r" : "\u{1D5FF}",
        "S" : "\u{1D5E6}",
        "s" : "\u{1D600}",
        "T" : "\u{1D5E7}",
        "t" : "\u{1D601}",
        "U" : "\u{1D5E8}",
        "u" : "\u{1D602}",
        "V" : "\u{1D5E9}",
        "v" : "\u{1D603}",
        "W" : "\u{1D5EA}",
        "w" : "\u{1D604}",
        "X" : "\u{1D5EB}",
        "x" : "\u{1D605}",
        "Y" : "\u{1D5EC}",
        "y" : "\u{1D606}",
        "Z" : "\u{1D5ED}",
        "z" : "\u{1D607}",

        "𝐴" : "\u{1D5D4}",
        "𝑎" : "\u{1D5EE}",
        "𝐵" : "\u{1D5D5}",
        "𝑏" : "\u{1D5EF}",
        "𝐶" : "\u{1D5D6}",
        "𝑐" : "\u{1D5F0}",
        "𝐷" : "\u{1D5D7}",
        "𝑑" : "\u{1D5F1}",
        "𝐸" : "\u{1D5D8}",
        "𝑒" : "\u{1D5F2}",
        "𝐹" : "\u{1D5D9}",
        "𝑓" : "\u{1D5F3}",
        "𝐺" : "\u{1D5DA}",
        "𝑔" : "\u{1D5F4}",
        "𝐻" : "\u{1D5DB}",
        "ℎ" : "\u{1D5F5}",
        "𝐼" : "\u{1D5DC}",
        "𝑖" : "\u{1D5F6}",
        "𝐽" : "\u{1D5DD}",
        "𝑗" : "\u{1D5F7}",
        "𝐾" : "\u{1D5DE}",
        "𝑘" : "\u{1D5F8}",
        "𝐿" : "\u{1D5DF}",
        "𝑙" : "\u{1D5F9}",
        "𝑀" : "\u{1D5E0}",
        "𝑚" : "\u{1D5FA}",
        "𝑁" : "\u{1D5E1}",
        "𝑛" : "\u{1D5FB}",
        "𝑂" : "\u{1D5E2}",
        "𝑜" : "\u{1D5FC}",
        "𝑃" : "\u{1D5E3}",
        "𝑝" : "\u{1D5FD}",
        "𝑄" : "\u{1D5E4}",
        "𝑞" : "\u{1D5FE}",
        "𝑅" : "\u{1D5E5}",
        "𝑟" : "\u{1D5FF}",
        "𝑆" : "\u{1D5E6}",
        "𝑠" : "\u{1D600}",
        "𝑇" : "\u{1D5E7}",
        "𝑡" : "\u{1D601}",
        "𝑈" : "\u{1D5E8}",
        "𝑢" : "\u{1D602}",
        "𝑉" : "\u{1D5E9}",
        "𝑣" : "\u{1D603}",
        "𝑊" : "\u{1D5EA}",
        "𝑤" : "\u{1D604}",
        "𝑋" : "\u{1D5EB}",
        "𝑥" : "\u{1D605}",
        "𝑌" : "\u{1D5EC}",
        "𝑦" : "\u{1D606}",
        "𝑍" : "\u{1D5ED}",
        "𝑧" : "\u{1D607}",

        "𝘈" : "\u{1D63C}",
        "𝘢" : "\u{1D656}",
        "𝘉" : "\u{1D63D}",
        "𝘣" : "\u{1D657}",
        "𝘊" : "\u{1D63E}",
        "𝘤" : "\u{1D658}",
        "𝘋" : "\u{1D63F}",
        "𝘥" : "\u{1D659}",
        "𝘌" : "\u{1D640}",
        "𝘦" : "\u{1D65A}",
        "𝘍" : "\u{1D641}",
        "𝘧" : "\u{1D65B}",
        "𝘎" : "\u{1D642}",
        "𝘨" : "\u{1D65C}",
        "𝘏" : "\u{1D643}",
        "𝘩" : "\u{1D65D}",
        "𝘐" : "\u{1D644}",
        "𝘪" : "\u{1D65E}",
        "𝘑" : "\u{1D645}",
        "𝘫" : "\u{1D65F}",
        "𝘒" : "\u{1D646}",
        "𝘬" : "\u{1D660}",
        "𝘓" : "\u{1D647}",
        "𝘭" : "\u{1D661}",
        "𝘔" : "\u{1D648}",
        "𝘮" : "\u{1D662}",
        "𝘕" : "\u{1D649}",
        "𝘯" : "\u{1D663}",
        "𝘖" : "\u{1D64A}",
        "𝘰" : "\u{1D664}",
        "𝘗" : "\u{1D64B}",
        "𝘱" : "\u{1D665}",
        "𝘘" : "\u{1D64C}",
        "𝘲" : "\u{1D666}",
        "𝘙" : "\u{1D64D}",
        "𝘳" : "\u{1D667}",
        "𝘚" : "\u{1D64E}",
        "𝘴" : "\u{1D668}",
        "𝘛" : "\u{1D64F}",
        "𝘵" : "\u{1D669}",
        "𝘜" : "\u{1D650}",
        "𝘶" : "\u{1D66A}",
        "𝘝" : "\u{1D651}",
        "𝘷" : "\u{1D66B}",
        "𝘞" : "\u{1D652}",
        "𝘸" : "\u{1D66C}",
        "𝘟" : "\u{1D653}",
        "𝘹" : "\u{1D66D}",
        "𝘠" : "\u{1D654}",
        "𝘺" : "\u{1D66E}",
        "𝘡" : "\u{1D655}",
        "𝘻" : "\u{1D66F}",

        "0" : "\u{1D7EC}",
        "1" : "\u{1D7ED}",
        "2" : "\u{1D7EE}",
        "3" : "\u{1D7EF}",
        "4" : "\u{1D7F0}",
        "5" : "\u{1D7F1}",
        "6" : "\u{1D7F2}",
        "7" : "\u{1D7F3}",
        "8" : "\u{1D7F4}",
        "9" : "\u{1D7F5}",

        // These symbols don't exist in textbf, but doesn't output an error
        "." : ".",
        "," : ",",
        "'" : "'",
        "′" : "'",
        '"' : '"',
        "″" : '"',
        "!" : "!",
        "?" : "?",
        "-" : "-",
        "\u2212" : "\u2212",
        "_" : "_",
        "^" : "^",
        "/" : "/",
        "+" : "+",
        "=" : "=",
        "$" : "$",
        "¢" : "¢",
        "£" : "£",
        "%" : "%",
        "&" : "&",
        "*" : "*",
        "@" : "@",
        "#" : "#",
        "|" : "|",
        "\\" : "\\",
        ":" : ":",
        "∶" : ":",
        ";" : ";",
        ">" : ">",
        "<" : "<",
        "°" : "°",
        "(" : "(",
        ")" : ")",
        "[" : "[",
        "]" : "]",
        "{" : "{",
        "}" : "}",

        "\u2710" : spacesChar.add,
        "\u270E" : spacesChar.remove,
		" " : spacesChar.add,
        "\u000A" : "\u000A",
        "" : ""
	};
	return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const textit = (arg, initialCommand) => {
    // textit stands for text italic
    // This function converts the list of characters to the corresponding italic character
    const symbols = {
        "A" : "\u{1D608}",
        "a" : "\u{1D622}",
        "B" : "\u{1D609}",
        "b" : "\u{1D623}",
        "C" : "\u{1D60A}",
        "c" : "\u{1D624}",
        "D" : "\u{1D60B}",
        "d" : "\u{1D625}",
        "E" : "\u{1D60C}",
        "e" : "\u{1D626}",
        "F" : "\u{1D60D}",
        "f" : "\u{1D627}",
        "G" : "\u{1D60E}",
        "g" : "\u{1D628}",
        "H" : "\u{1D60F}",
        "h" : "\u{1D629}",
        "I" : "\u{1D610}",
        "i" : "\u{1D62A}",
        "J" : "\u{1D611}",
        "j" : "\u{1D62B}",
        "K" : "\u{1D612}",
        "k" : "\u{1D62C}",
        "L" : "\u{1D613}",
        "l" : "\u{1D62D}",
        "M" : "\u{1D614}",
        "m" : "\u{1D62E}",
        "N" : "\u{1D615}",
        "n" : "\u{1D62F}",
        "O" : "\u{1D616}",
        "o" : "\u{1D630}",
        "P" : "\u{1D617}",
        "p" : "\u{1D631}",
        "Q" : "\u{1D618}",
        "q" : "\u{1D632}",
        "R" : "\u{1D619}",
        "r" : "\u{1D633}",
        "S" : "\u{1D61A}",
        "s" : "\u{1D634}",
        "T" : "\u{1D61B}",
        "t" : "\u{1D635}",
        "U" : "\u{1D61C}",
        "u" : "\u{1D636}",
        "V" : "\u{1D61D}",
        "v" : "\u{1D637}",
        "W" : "\u{1D61E}",
        "w" : "\u{1D638}",
        "X" : "\u{1D61F}",
        "x" : "\u{1D639}",
        "Y" : "\u{1D620}",
        "y" : "\u{1D63A}",
        "Z" : "\u{1D621}",
        "z" : "\u{1D63B}",

        "𝐴" : "\u{1D608}",
        "𝑎" : "\u{1D622}",
        "𝐵" : "\u{1D609}",
        "𝑏" : "\u{1D623}",
        "𝐶" : "\u{1D60A}",
        "𝑐" : "\u{1D624}",
        "𝐷" : "\u{1D60B}",
        "𝑑" : "\u{1D625}",
        "𝐸" : "\u{1D60C}",
        "𝑒" : "\u{1D626}",
        "𝐹" : "\u{1D60D}",
        "𝑓" : "\u{1D627}",
        "𝐺" : "\u{1D60E}",
        "𝑔" : "\u{1D628}",
        "𝐻" : "\u{1D60F}",
        "ℎ" : "\u{1D629}",
        "𝐼" : "\u{1D610}",
        "𝑖" : "\u{1D62A}",
        "𝐽" : "\u{1D611}",
        "𝑗" : "\u{1D62B}",
        "𝐾" : "\u{1D612}",
        "𝑘" : "\u{1D62C}",
        "𝐿" : "\u{1D613}",
        "𝑙" : "\u{1D62D}",
        "𝑀" : "\u{1D614}",
        "𝑚" : "\u{1D62E}",
        "𝑁" : "\u{1D615}",
        "𝑛" : "\u{1D62F}",
        "𝑂" : "\u{1D616}",
        "𝑜" : "\u{1D630}",
        "𝑃" : "\u{1D617}",
        "𝑝" : "\u{1D631}",
        "𝑄" : "\u{1D618}",
        "𝑞" : "\u{1D632}",
        "𝑅" : "\u{1D619}",
        "𝑟" : "\u{1D633}",
        "𝑆" : "\u{1D61A}",
        "𝑠" : "\u{1D634}",
        "𝑇" : "\u{1D61B}",
        "𝑡" : "\u{1D635}",
        "𝑈" : "\u{1D61C}",
        "𝑢" : "\u{1D636}",
        "𝑉" : "\u{1D61D}",
        "𝑣" : "\u{1D637}",
        "𝑊" : "\u{1D61E}",
        "𝑤" : "\u{1D638}",
        "𝑋" : "\u{1D61F}",
        "𝑥" : "\u{1D639}",
        "𝑌" : "\u{1D620}",
        "𝑦" : "\u{1D63A}",
        "𝑍" : "\u{1D621}",
        "𝑧" : "\u{1D63B}",

        "𝗔" : "\u{1D63C}",
        "𝗮" : "\u{1D656}",
        "𝗕" : "\u{1D63D}",
        "𝗯" : "\u{1D657}",
        "𝗖" : "\u{1D63E}",
        "𝗰" : "\u{1D658}",
        "𝗗" : "\u{1D63F}",
        "𝗱" : "\u{1D659}",
        "𝗘" : "\u{1D640}",
        "𝗲" : "\u{1D65A}",
        "𝗙" : "\u{1D641}",
        "𝗳" : "\u{1D65B}",
        "𝗚" : "\u{1D642}",
        "𝗴" : "\u{1D65C}",
        "𝗛" : "\u{1D643}",
        "𝗵" : "\u{1D65D}",
        "𝗜" : "\u{1D644}",
        "𝗶" : "\u{1D65E}",
        "𝗝" : "\u{1D645}",
        "𝗷" : "\u{1D65F}",
        "𝗞" : "\u{1D646}",
        "𝗸" : "\u{1D660}",
        "𝗟" : "\u{1D647}",
        "𝗹" : "\u{1D661}",
        "𝗠" : "\u{1D648}",
        "𝗺" : "\u{1D662}",
        "𝗡" : "\u{1D649}",
        "𝗻" : "\u{1D663}",
        "𝗢" : "\u{1D64A}",
        "𝗼" : "\u{1D664}",
        "𝗣" : "\u{1D64B}",
        "𝗽" : "\u{1D665}",
        "𝗤" : "\u{1D64C}",
        "𝗾" : "\u{1D666}",
        "𝗥" : "\u{1D64D}",
        "𝗿" : "\u{1D667}",
        "𝗦" : "\u{1D64E}",
        "𝘀" : "\u{1D668}",
        "𝗧" : "\u{1D64F}",
        "𝘁" : "\u{1D669}",
        "𝗨" : "\u{1D650}",
        "𝘂" : "\u{1D66A}",
        "𝗩" : "\u{1D651}",
        "𝘃" : "\u{1D66B}",
        "𝗪" : "\u{1D652}",
        "𝘄" : "\u{1D66C}",
        "𝗫" : "\u{1D653}",
        "𝘅" : "\u{1D66D}",
        "𝗬" : "\u{1D654}",
        "𝘆" : "\u{1D66E}",
        "𝗭" : "\u{1D655}",
        "𝘇" : "\u{1D66F}",

        "𝟬" : "𝟬",
        "𝟭" : "𝟭",
        "𝟮" : "𝟮",
        "𝟯" : "𝟯",
        "𝟰" : "𝟰",
        "𝟱" : "𝟱",
        "𝟲" : "𝟲",
        "𝟳" : "𝟳",
        "𝟴" : "𝟴",
        "𝟵" : "𝟵",

        // These symbols don't exist in textit, but doesn't output an error
        "." : ".",
        "," : ",",
        "'" : "'",
        "′" : "'",
        '"' : '"',
        "″" : '"',
        "!" : "!",
        "?" : "?",
        "-" : "-",
        "\u2212" : "\u2212",
        "_" : "_",
        "^" : "^",
        "/" : "/",
        "+" : "+",
        "=" : "=",
        "$" : "$",
        "¢" : "¢",
        "£" : "£",
        "%" : "%",
        "&" : "&",
        "*" : "*",
        "@" : "@",
        "#" : "#",
        "|" : "|",
        "\\" : "\\",
        ":" : ":",
        "∶" : ":",
        ";" : ";",
        ">" : ">",
        "<" : "<",
        "°" : "°",
        "(" : "(",
        ")" : ")",
        "[" : "[",
        "]" : "]",
        "{" : "{",
        "}" : "}",
        "0" : "0",
        "1" : "1",
        "2" : "2",
        "3" : "3",
        "4" : "4",
        "5" : "5",
        "6" : "6",
        "7" : "7",
        "8" : "8",
        "9" : "9",

        "\u2710" : spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : spacesChar.add,
        "\u000A" : "\u000A",
        "" : ""
	};
	return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const texttt = (arg, initialCommand) => {
    // texttt stands for text typewriter
    // This function converts the list of characters to the corresponding typewriter character
    const symbols = {
        "A" : "\u{1D670}",
        "a" : "\u{1D68A}",
        "B" : "\u{1D671}",
        "b" : "\u{1D68B}",
        "C" : "\u{1D672}",
        "c" : "\u{1D68C}",
        "D" : "\u{1D673}",
        "d" : "\u{1D68D}",
        "E" : "\u{1D674}",
        "e" : "\u{1D68E}",
        "F" : "\u{1D675}",
        "f" : "\u{1D68F}",
        "G" : "\u{1D676}",
        "g" : "\u{1D690}",
        "H" : "\u{1D677}",
        "h" : "\u{1D691}",
        "I" : "\u{1D678}",
        "i" : "\u{1D692}",
        "J" : "\u{1D679}",
        "j" : "\u{1D693}",
        "K" : "\u{1D67A}",
        "k" : "\u{1D694}",
        "L" : "\u{1D67B}",
        "l" : "\u{1D695}",
        "M" : "\u{1D67C}",
        "m" : "\u{1D696}",
        "N" : "\u{1D67D}",
        "n" : "\u{1D697}",
        "O" : "\u{1D67E}",
        "o" : "\u{1D698}",
        "P" : "\u{1D67F}",
        "p" : "\u{1D699}",
        "Q" : "\u{1D680}",
        "q" : "\u{1D69A}",
        "R" : "\u{1D681}",
        "r" : "\u{1D69B}",
        "S" : "\u{1D682}",
        "s" : "\u{1D69C}",
        "T" : "\u{1D683}",
        "t" : "\u{1D69D}",
        "U" : "\u{1D684}",
        "u" : "\u{1D69E}",
        "V" : "\u{1D685}",
        "v" : "\u{1D69F}",
        "W" : "\u{1D686}",
        "w" : "\u{1D6A0}",
        "X" : "\u{1D687}",
        "x" : "\u{1D6A1}",
        "Y" : "\u{1D688}",
        "y" : "\u{1D6A2}",
        "Z" : "\u{1D689}",
        "z" : "\u{1D6A3}",

        "𝐴" : "\u{1D670}",
        "𝑎" : "\u{1D68A}",
        "𝐵" : "\u{1D671}",
        "𝑏" : "\u{1D68B}",
        "𝐶" : "\u{1D672}",
        "𝑐" : "\u{1D68C}",
        "𝐷" : "\u{1D673}",
        "𝑑" : "\u{1D68D}",
        "𝐸" : "\u{1D674}",
        "𝑒" : "\u{1D68E}",
        "𝐹" : "\u{1D675}",
        "𝑓" : "\u{1D68F}",
        "𝐺" : "\u{1D676}",
        "𝑔" : "\u{1D690}",
        "𝐻" : "\u{1D677}",
        "ℎ" : "\u{1D691}",
        "𝐼" : "\u{1D678}",
        "𝑖" : "\u{1D692}",
        "𝐽" : "\u{1D679}",
        "𝑗" : "\u{1D693}",
        "𝐾" : "\u{1D67A}",
        "𝑘" : "\u{1D694}",
        "𝐿" : "\u{1D67B}",
        "𝑙" : "\u{1D695}",
        "𝑀" : "\u{1D67C}",
        "𝑚" : "\u{1D696}",
        "𝑁" : "\u{1D67D}",
        "𝑛" : "\u{1D697}",
        "𝑂" : "\u{1D67E}",
        "𝑜" : "\u{1D698}",
        "𝑃" : "\u{1D67F}",
        "𝑝" : "\u{1D699}",
        "𝑄" : "\u{1D680}",
        "𝑞" : "\u{1D69A}",
        "𝑅" : "\u{1D681}",
        "𝑟" : "\u{1D69B}",
        "𝑆" : "\u{1D682}",
        "𝑠" : "\u{1D69C}",
        "𝑇" : "\u{1D683}",
        "𝑡" : "\u{1D69D}",
        "𝑈" : "\u{1D684}",
        "𝑢" : "\u{1D69E}",
        "𝑉" : "\u{1D685}",
        "𝑣" : "\u{1D69F}",
        "𝑊" : "\u{1D686}",
        "𝑤" : "\u{1D6A0}",
        "𝑋" : "\u{1D687}",
        "𝑥" : "\u{1D6A1}",
        "𝑌" : "\u{1D688}",
        "𝑦" : "\u{1D6A2}",
        "𝑍" : "\u{1D689}",
        "𝑧" : "\u{1D6A3}",

        "0" : "\u{1D7F6}",
        "1" : "\u{1D7F7}",
        "2" : "\u{1D7F8}",
        "3" : "\u{1D7F9}",
        "4" : "\u{1D7FA}",
        "5" : "\u{1D7FB}",
        "6" : "\u{1D7FC}",
        "7" : "\u{1D7FD}",
        "8" : "\u{1D7FE}",
        "9" : "\u{1D7FF}",

        // These symbols don't exist in texttt, but don't output errors
        "." : ".",
        "," : ",",
        "'" : "'",
        "′" : "'",
        '"' : '"',
        "″" : '"',
        "!" : "!",
        "?" : "?",
        "-" : "-",
        "\u2212" : "\u2212",
        "_" : "_",
        "^" : "^",
        "/" : "/",
        "+" : "+",
        "=" : "=",
        "$" : "$",
        "¢" : "¢",
        "£" : "£",
        "%" : "%",
        "&" : "&",
        "*" : "*",
        "@" : "@",
        "#" : "#",
        "|" : "|",
        "\\" : "\\",
        ":" : ":",
        "∶" : ":",
        ";" : ";",
        ">" : ">",
        "<" : "<",
        "°" : "°",
        "(" : "(",
        ")" : ")",
        "[" : "[",
        "]" : "]",
        "{" : "{",
        "}" : "}",

        "\u2710" : spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : spacesChar.add,
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const textsc = (arg, initialCommand) => {
    // textsc stands for text small caps
    // This function converts the list of characters to the corresponding typewriter character
    const symbols = {
        "A" : "A",
        "a" : "ᴀ",
        "B" : "B",
        "b" : "ʙ",
        "C" : "C",
        "c" : "ᴄ",
        "D" : "D",
        "d" : "ᴅ",
        "E" : "E",
        "e" : "ᴇ",
        "F" : "F",
        "f" : "ꜰ",
        "G" : "G",
        "g" : "ɢ",
        "H" : "H",
        "h" : "ʜ",
        "I" : "I",
        "i" : "ɪ",
        "J" : "J",
        "j" : "ᴊ",
        "K" : "K",
        "k" : "ᴋ",
        "L" : "L",
        "l" : "ʟ",
        "M" : "M",
        "m" : "ᴍ",
        "N" : "N",
        "n" : "ɴ",
        "O" : "O",
        "o" : "ᴏ",
        "P" : "P",
        "p" : "ᴘ",
        "Q" : "Q",
        "q" : "ꞯ",
        "R" : "R",
        "r" : "ʀ",
        "S" : "S",
        "s" : "ꜱ",
        "T" : "T",
        "t" : "ᴛ",
        "U" : "U",
        "u" : "ᴜ",
        "V" : "V",
        "v" : "ᴜ",
        "W" : "W",
        "w" : "ᴡ",
        "X" : "X",
        "x" : "ₓ",
        "Y" : "Y",
        "y" : "ʏ",
        "Z" : "Z",
        "z" : "ᴢ",

        "𝐴" : "A",
        "𝑎" : "ᴀ",
        "𝐵" : "B",
        "𝑏" : "ʙ",
        "𝐶" : "C",
        "𝑐" : "ᴄ",
        "𝐷" : "D",
        "𝑑" : "ᴅ",
        "𝐸" : "E",
        "𝑒" : "ᴇ",
        "𝐹" : "F",
        "𝑓" : "ꜰ",
        "𝐺" : "G",
        "𝑔" : "ɢ",
        "𝐻" : "H",
        "ℎ" : "ʜ",
        "𝐼" : "I",
        "𝑖" : "ɪ",
        "𝐽" : "J",
        "𝑗" : "ᴊ",
        "𝐾" : "K",
        "𝑘" : "ᴋ",
        "𝐿" : "L",
        "𝑙" : "ʟ",
        "𝑀" : "M",
        "𝑚" : "ᴍ",
        "𝑁" : "N",
        "𝑛" : "ɴ",
        "𝑂" : "O",
        "𝑜" : "ᴏ",
        "𝑃" : "P",
        "𝑝" : "ᴘ",
        "𝑄" : "Q",
        "𝑞" : "ꞯ",
        "𝑅" : "R",
        "𝑟" : "ʀ",
        "𝑆" : "S",
        "𝑠" : "ꜱ",
        "𝑇" : "T",
        "𝑡" : "ᴛ",
        "𝑈" : "U",
        "𝑢" : "ᴜ",
        "𝑉" : "V",
        "𝑣" : "ᴠ",
        "𝑊" : "W",
        "𝑤" : "ᴡ",
        "𝑋" : "X",
        "𝑥" : "ₓ",
        "𝑌" : "Y",
        "𝑦" : "ʏ",
        "𝑍" : "Z",
        "𝑧" : "ᴢ",

        "0" : "0",
        "1" : "1",
        "2" : "2",
        "3" : "3",
        "4" : "4",
        "5" : "5",
        "6" : "6",
        "7" : "7",
        "8" : "8",
        "9" : "9",

        // These symbols don't exist in texttt, but don't output errors
        "." : ".",
        "," : ",",
        "'" : "'",
        "′" : "'",
        '"' : '"',
        "″" : '"',
        "!" : "!",
        "?" : "?",
        "-" : "-",
        "\u2212" : "\u2212",
        "_" : "_",
        "^" : "^",
        "/" : "/",
        "+" : "+",
        "=" : "=",
        "$" : "$",
        "¢" : "¢",
        "£" : "£",
        "%" : "%",
        "&" : "&",
        "*" : "*",
        "@" : "@",
        "#" : "#",
        "|" : "|",
        "\\" : "\\",
        ":" : ":",
        "∶" : ":",
        ";" : ";",
        ">" : ">",
        "<" : "<",
        "°" : "°",
        "(" : "(",
        ")" : ")",
        "[" : "[",
        "]" : "]",
        "{" : "{",
        "}" : "}",

        "\u2710" : spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : spacesChar.add,
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const text = (arg, initialCommand) => {
    // This function doesn't change the output (i.e. "abc" -> "abc")
    const symbols = {
        "A" : "A",
        "a" : "a",
        "B" : "B",
        "b" : "b",
        "C" : "C",
        "c" : "c",
        "D" : "D",
        "d" : "d",
        "E" : "E",
        "e" : "e",
        "F" : "F",
        "f" : "f",
        "G" : "G",
        "g" : "g",
        "H" : "H",
        "h" : "h",
        "I" : "I",
        "i" : "i",
        "J" : "J",
        "j" : "j",
        "K" : "K",
        "k" : "k",
        "L" : "L",
        "l" : "l",
        "M" : "M",
        "m" : "m",
        "N" : "N",
        "n" : "n",
        "O" : "O",
        "o" : "o",
        "P" : "P",
        "p" : "p",
        "Q" : "Q",
        "q" : "q",
        "R" : "R",
        "r" : "r",
        "S" : "S",
        "s" : "s",
        "T" : "T",
        "t" : "t",
        "U" : "U",
        "u" : "u",
        "V" : "V",
        "v" : "v",
        "W" : "W",
        "w" : "w",
        "X" : "X",
        "x" : "x",
        "Y" : "Y",
        "y" : "y",
        "Z" : "Z",
        "z" : "z",

        "𝐴" : "A",
        "𝑎" : "a",
        "𝐵" : "B",
        "𝑏" : "b",
        "𝐶" : "C",
        "𝑐" : "c",
        "𝐷" : "D",
        "𝑑" : "d",
        "𝐸" : "E",
        "𝑒" : "e",
        "𝐹" : "F",
        "𝑓" : "f",
        "𝐺" : "G",
        "𝑔" : "g",
        "𝐻" : "H",
        "ℎ" : "h",
        "𝐼" : "I",
        "𝑖" : "i",
        "𝐽" : "J",
        "𝑗" : "j",
        "𝐾" : "K",
        "𝑘" : "k",
        "𝐿" : "L",
        "𝑙" : "l",
        "𝑀" : "M",
        "𝑚" : "m",
        "𝑁" : "N",
        "𝑛" : "n",
        "𝑂" : "O",
        "𝑜" : "o",
        "𝑃" : "P",
        "𝑝" : "p",
        "𝑄" : "Q",
        "𝑞" : "q",
        "𝑅" : "R",
        "𝑟" : "r",
        "𝑆" : "S",
        "𝑠" : "s",
        "𝑇" : "T",
        "𝑡" : "t",
        "𝑈" : "U",
        "𝑢" : "u",
        "𝑉" : "V",
        "𝑣" : "v",
        "𝑊" : "W",
        "𝑤" : "w",
        "𝑋" : "X",
        "𝑥" : "x",
        "𝑌" : "Y",
        "𝑦" : "y",
        "𝑍" : "Z",
        "𝑧" : "z",

        "0" : "0",
        "1" : "1",
        "2" : "2",
        "3" : "3",
        "4" : "4",
        "5" : "5",
        "6" : "6",
        "7" : "7",
        "8" : "8",
        "9" : "9",

        "." : ".",
        "," : ",",
        "'" : "'",
        "′" : "'",
        '"' : '"',
        "″" : '"',
        "!" : "!",
        "?" : "?",
        "-" : "-",
        "\u2212" : "\u2212",
        "_" : "_",
        "^" : "^",
        "/" : "/",
        "+" : "+",
        "=" : "=",
        "$" : "$",
        "¢" : "¢",
        "£" : "£",
        "%" : "%",
        "&" : "&",
        "*" : "*",
        "@" : "@",
        "#" : "#",
        "|" : "|",
        "\\" : "\\",
        ":" : ":",
        "∶" : ":",
        ";" : ";",
        ">" : ">",
        "<" : "<",
        "°" : "°",
        "(" : "(",
        ")" : ")",
        "[" : "[",
        "]" : "]",
        "{" : "{",
        "}" : "}",

        "\u2710" : spacesChar.add,
        "\u270E" : spacesChar.remove,
        " " : spacesChar.add,
        "\u000A" : "\u000A",
        "" : ""
    };
    return replaceLetters(arg[0], symbols, initialCommand).concat(extraArgs(arg.slice(1), initialCommand));
};

const hspace = (arg, initialCommand) => {
    // hspace stands for horizontal space
    // Adds the number of space specified in 'arg'
    let spaces = [];
    const num = arg[0].join("");
    if (isNaN(num)) {
        spaces.push(mistakes(initialCommand + "{" + num + "}", undefined, "Argument must be a number", initialCommand + "{" + num + "}"));
    } else {
        for (let i=0; i<parseInt(num); i++) {
            spaces.push(spacesChar.add);
        };
    };
    return spaces.concat(extraArgs(arg.slice(1), initialCommand));
};

const vskip = (arg, initialCommand) => {
    // vskip stands for vertical skip
    // Adds the number of linebreaks specified in 'arg'
    let skips = [];
    const num = arg[0].join("");
    if (isNaN(num)) {
        skips.push(mistakes(initialCommand + "{" + num + "}", undefined, "Argument must be a number", initialCommand + "{" + num + "}"));
    } else {
        for (let i=0; i<parseInt(num); i++) {
            skips.push("\u000A");
        };
    };
    return skips.concat(extraArgs(arg.slice(1), initialCommand));
};

const phantom = (arg, initialCommand) => {
    // Outputs the same number of spaces as the length of the argument
    // e.g. \phantom{abc} -> 3 spaces and \phantom{\int} -> 1 space
    let spaces = [];
    for (let i=0; i<arg[0].length; i++) {
        spaces.push(spacesChar.add);
    };
    if (hasFailure(arg[0])) {
        mistakes(initialCommand + "{" + arg[0].join("") + "}", undefined, "Undefined argument");
    };
    return spaces.concat(extraArgs(arg.slice(1), initialCommand));
};

const mathord = (arg, initialCommand) => {
    // Removes spaces around arg
    // \mathord{arg} is equivalent to {arg} and \! arg \!
    let output = [];
    for (let i in arg) {
        output.push(spacesChar.remove, arg[i].join(""), spacesChar.remove);
        if (hasFailure(arg[i])) {
            mistakes(initialCommand + "{" + arg[i].join("") + "}", undefined, "Undefined argument");
        };
    };
    return output;
};

const sqrt = (arg, initialCommand) => {
    // sqrt stands for square root
    const numStart = parseInt(initialCommand.indexOf("["));
    const numEnd = parseInt(initialCommand.indexOf("]"));
    let rootNum;
    if ((numStart === -1) || (numEnd === -1)) {
        if ((numStart === -1) && (numEnd === -1)) {
            rootNum = undefined;
        } else {
            mistakes(initialCommand + " should take the form \\sqrt[n]{x}", undefined, "ⁿ√𝑥");
            return [failure(initialCommand)];
        };
    } else {
        rootNum = initialCommand.substring(numStart + 1, numEnd);
    };
    let output = "";
    switch (rootNum) {
        // There's already a unicode symbol for square root, cube root and 4th root
        // If rootNum is different than those, the symbol is built
        case "3":
            output += "\u221B";
            break;
        case "4":
            output += "\u221C";
            break;
        case undefined:
            output += "\u221A";
            break;
        default:
            output += addSymbol(superscript([rootNum.split("")], initialCommand)) + "\u221A";
    };
    if (arg.length > 0) {
        if (arg[0].length >= 2) {
            output += "(" + addSymbolArray(arg[0], initialCommand + "{" + arg[0].join("") + "}") + ")";
        } else {
            output += addSymbolArray(arg[0], initialCommand + "{" + arg[0].join("") + "}");
        };
        return [output].concat(extraArgs(arg.slice(1), initialCommand));
    } else  {
        return [output];
    }
};

const frac = (arg, initialCommand) => {
    // Used to make a fraction
    // If a character doesn't exist in superscript or subscript, it outputs the fraction in the format f(x)/g(x)
    let output = [];
    if (arg.length < 2) {
        mistakes("\\frac{}{}", undefined, "Two arguments needed");
        return [failure(initialCommand + arg.map((a) => "{" + a.join("") + "}").join(""))];
    };
    output.push(...addSymbol(superscript([arg[0]], initialCommand, true), true), "\u2215");
    output.push(...addSymbol(subscript([arg[1]], initialCommand, true), true));
    if ((!hasFailure(output)) && (output.filter(e => accents[e] !== undefined).length === 0)) {
        return output.concat(extraArgs(arg.slice(2), initialCommand));
    } else {
        // TODO: Why???
        if (argsText(arg).includes(spacesChar.add)) {
            const spaces = arg.filter(c => {return c.includes(spacesChar.add)});
            for (let i in spaces) {
                mistakes(initialCommand + "{" + argsText(arg) + "}", undefined, spaces[i]);
            };
        };
        output = ["(", 
                  addSymbolArray(arg[0], "\\frac{" + arg[0].join("") + "}" + "{" + arg[1].join("") + "}"), 
                  "/", 
                  addSymbolArray(arg[1], "\\frac{" + arg[0].join("") + "}" + "{" + arg[1].join("") + "}"),
                   ")"];
        return output.concat(extraArgs(arg.slice(2), initialCommand));
    };
};

const singleCharFrac = (arg, initialCommand) => {
    // Some fractions already exists as unicode symbols they can be accessed via this function
    let noSpaceArg = arg.slice(0,2).join("").replace(/ /g, "")
                                            .replace(/\u000A/g, "");
    const fractions = {
        "12" : "\u00BD",
        "17" : "⅐",
        "19" : "⅑",
        "110" : "⅒",
        "13"  :"⅓",
        "23" : "⅔",
        "15" : "⅕",
        "25" : "⅖",
        "35" : "⅗",
        "45" : "⅘",
        "16" : "⅙",
        "56" : "⅚",
        "18" : "⅛",
        "38" : "⅜",
        "58" : "⅝",
        "78" : "⅞",
        "ac" : "\u2100",
        "as" : "\u2101",
        "co" : "\u2105",
        "cu" : "\u2106"
    };
    let output = fractions[noSpaceArg];
    return (output !== undefined) ? [output].concat(extraArgs(arg.slice(2), initialCommand)) : frac(arg, initialCommand);
};

const pmod = (arg, initialCommand) => {
    // returns ' (mod arg)'
    return [spacesChar.add+"(mod"+spacesChar.add + arg[0].join("") + ")"].concat(extraArgs(arg.slice(1), initialCommand));
};

const today = () => {
    // returns today's date
    let date = new Date();
    let month = date.toLocaleString('en', {month: 'long'});  // Will change to 'default' when many languages will be supported
    return month + " " + date.getDate() + ", " + date.getFullYear();
};

// These functions call combineSymbols with a predetermined symbol

const overline = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0305")};

const underline = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0332")};

const vec = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u20D7")};

const hvec = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u20D1")};

const overfrown = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0361", "\u0361")};

const oversmile = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u035D", "\u035D")};

const undersmile = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u035C", "\u035C")};

const hat = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0302")};

const not = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0338")};

const tilde = (arg, initialCommand) => {if ((arg == "\u27F6") || (arg == "\u2192")) {return ["\u2972"]} else {return combineSymbols(arg, initialCommand, "\u0303", "\u0360")}};

const dot = (arg, initialCommand) => {if ((arg == "=") || (arg == "\u003D")) {return ["\u2250"]} else if (arg == "\u2261") {return ["\u2A67"]} else {return combineSymbols(arg, initialCommand, "\u0307")}};

const ddot = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0308")};

const underarrow = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0362", "\u0362")};

const underharpoon = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u20EC")};

const acute = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0301")};

const grave = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0300")};

const bar = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0304")};

const breve = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0306")};

const caron = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u030C")};

const doubleAccute = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u030B")};

const ringAbove = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u030A")};

const cedilla = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0327")};

const dotBelow = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0323")};

const ogonek = (arg, initialCommand) => {return combineSymbols(arg, initialCommand, "\u0328")};

const stackSymbols = (arg, initialCommand, dict) => {
    // Used in overset, underset and stackrel
    // Returns the first argument above or below the symbol in the middle of the second argument
    if (arg.length < 2) {
        mistakes(initialCommand+"{}{}", undefined, "Two arguments needed");
        return [failure(initialCommand + arg.map((a) => "{" + a.join("") + "}").join(""))];
    };
    let rel = arg[0];
    let mid = arg[1];
    if (rel.length > 1) {
        return mistakes(initialCommand+"{"+rel.join("")+"}{"+mid.join("")+"}", undefined, "Length of first argument must be one.", initialCommand+"{"+rel.join("")+"}{"+mid.join("")+"}");
    };
    mistakes(initialCommand+"{"+rel.join("")+"}{"+mid.join("")+"}", dict[rel[0]], (rel[0] !== undefined) ? rel[0] : "Argument doesn't exist");
    mid[Math.floor(mid.length/2)] += (dict[rel[0]] !== undefined) ? dict[rel[0]] : "";
    return [mid.join("")].concat(extraArgs(arg.slice(2), initialCommand));
};

const overset = (arg, initialCommand) => {
    return stackSymbols(arg, initialCommand, Above);
};

const stackrel = (arg, initialCommand) => {
    return overset(arg, initialCommand);
};

const underset = (arg, initialCommand) => {
    return stackSymbols(arg, initialCommand, Below);
};


//-----------------------------------------------------//


/** Dictionaries **/

// Space: internally represented with \u2710 (✐), but switched to a real space before output
// Remove space: if there's one surrounding \! \u270E (✎) will be removed before the output
const spacesChar = {add: "\u2710", remove: "\u270E"};

// mathDictionary is the main dict for converting commands into symbols
const mathDictionary = {
    // Math operators
    "\\times" : "\u00D7",
    "\\rtimes" : "\u22CA",
    "\\ltimes" : "\u22C9",
    "\\div" : "\u00F7",
    "\\longdiv" : "\u27CC",
    "\\int" : "\u222B",
    "\\iint" : "\u222C",
    "\\iiint" : "\u222D",
    "\\iiiint" : "\u2A0C",
    "\\oint" : "\u222E",
    "\\oiint" : "\u222F",
    "\\oiiint" : "\u2230",
    "\\intclockwise" : "\u2231",
    "\\ointclockwise" : "\u2232",
    "\\ointctrclockwise" : "\u2233",
    "\\sqint" : "\u2A16",
    "\\fint" : "\u2A0F",
    "\\cupint" : "\u2A1A",
    "\\capint" : "\u2A19",
    "\\overbarint" : "\u2A1B",
    "\\underbarint" : "\u2A1C",
    "\\cupplus" : "\u228E",
    "\\timesint" : "\u2A18",
    "\\ast" : "\u2217",
    "\\star" : "\u22C6",
    "\\partial" : "\u2202",
    "\\nabla" : "\u2207",
    "\\sqrt2" : "\u221A",
    "\\sqrt3" : "\u221B",
    "\\sqrt4" : "\u221C",
    "\\circ" : "\u2218",
    "\\sum" : "\u2211",
    "\\osum" : "\u2A0A",
    "\\sumint" : "\u2A0B",
    "\\prod" : "\u220F",
    "\\cdot" : "\u00B7",
    "\\cdotp" : "\u22C5",
    "\\pm" : "\u00B1",
    "\\mp" : "\u2213",
    "\\emptyset" : "\u2205",
    "\\sin" : "sin",
    "\\cos" : "cos",
    "\\tan" : "tan",
    "\\arcsin" : "arcsin",
    "\\arccos" : "arccos",
    "\\arctan" : "arctan",
    "\\cot" : "cot",
    "\\csc" : "csc",
    "\\sec" : "sec",
    "\\arccot" : "arccot",
    "\\arccsc" : "arccsc",
    "\\arcsec" : "arcsec",
    "\\*" : "*",
    "\\det" : "det",
    "\\rank" : "rank",
    "\\log" : "log",
    "\\ln" : "ln",
    "\\lim" : "lim",
    "\\mod" : spacesChar.add+spacesChar.add+"mod"+spacesChar.add,  // 2 spaces + 'mod' + 1 space
    "\\bmod" : spacesChar.add+"mod"+spacesChar.add,  // 1 space + 'mod' + 1 space
    "\\pmod" : pmod,  // 1 space + '(mod' + 1 space + arg + ')'
    "\\cup" : "\u222A",
    "\\Cup" : "\u22D3",
    "\\sqcup" : "\u2294",
    "\\sqCup" : "\u2A4F",
    "\\cap" : "\u2229",
    "\\Cap" : "\u22D2",
    "\\sqcap" : "\u2293",
    "\\sqCap" : "\u2A4E",
    "\\uplus" : "\u228E",
    "\\def" : "\u225D",
    "\\coloneqq" : "\u2254",
    "\\eqqcolon" : "\u2255",
    "\\vee" : "\u2228",
    "\\veebar" : "\u22BB",
    "\\barvee" : "\u22BD",
    "\\doublevee" : "\u2A56",
    "\\wedge" : "\u2227",
    "\\barwedge" : "\u22BC",
    "\\doublewedge" : "\u2A55",
    "\\curlyvee" : "\u22CE",
    "\\curlywedge" : "\u22CF",
    "\\diamond" : "\u22C4",
    "\\wr" : "\u2240",
    "\\oplus" : "\u2295",
    "\\bigoplus" : "\u2A01",
    "\\ominus" : "\u2296",
    "\\otimes" : "\u2297",
    "\\bigotimes" : "\u2A02",
    "\\oslash" : "\u2298",
    "\\odot" : "\u2299",
    "\\bigodot" : "\u2A00",
    "\\obullet" : "\u29BF",
    "\\ocirc" : "\u29BE",
    "\\operp" : "\u29B9",
    "\\oparallel" : "\u29B7",
    "\\oast" : "\u229B",
    "\\oeq" : "\u229C",
    "\\opluslhrim" : "\u2A2D",
    "\\oplusrhrim" : "\u2A2E",
    "\\otimeslhrim" : "\u2A34",
    "\\otimesrhrim" : "\u2A35",
    "\\boxplus" : "\u229E",
    "\\boxminus" : "\u229F",
    "\\boxtimes" : "\u22A0",
    "\\boxdot" : "\u22A1",
    "\\amalg" : "\u2210",
    "\\tprime" : "\u2034",
    "\\lthree" : "\u22CB",
    "\\rthree" : "\u22CC",
    "\\pitchfork" : "\u22D4",
    "\\topfork" : "\u2ADA",
    "\\invamp" : "\u214B",
    "\\originalof" : "\u22B6",
    "\\imageof" : "\u22B7",
    "\\multimap" : "\u22B8",
    "\\leftmultimap" : "\u27DC",
    "\\uptack" : "\u27DF",
    "\\xor" : "\u22BB",
    "\\nand" : "\u22BC",
    "\\nor" : "\u22BD",
    "\\divideontimes" : "\u22C7",
    "\\smashtimes" : "\u2A33",
    "\\fracline" : "\u2215",  // Better suited for superscript over subscript

    // Relations
    "\\forall" : "\u2200",
    "\\exists" : "\u2203",
    "\\nexists" : "\u2204",
    "\\land" : "\u2227",
    "\\lor" : "\u2228",
    "\\sqland" : "\u27CE",
    "\\sqlor" : "\u27CF",
    "\\in" : "\u2208",
    "\\notin" : "\u2209",
    "\\ni" : "\u220B",
    "\\subset" : "\u2282",
    "\\nsubset" : "\u2284",
    "\\subseteq" : "\u2286",
    "\\nsubseteq" : "\u2288",
    "\\supset" : "\u2283",
    "\\nsupset" : "\u2285",
    "\\supseteq" : "\u2287",
    "\\nsupseteq" : "\u2289",
    "\\sqsubset" : "\u228F",
    "\\sqsupset" : "\u2290",
    "\\sqsubseteq" : "\u2291",
    "\\sqsupseteq" : "\u2292",
    "\\Subset" : "\u22D0",
    "\\Supset" : "\u22D1",
    "\\subsetplus" : "\u2ABF",
    "\\supsetplus" : "\u2AC0",
    "\\osubset" : "\u27C3",
    "\\osupset" : "\u27C4",
    "\\setminus" : "\u2216",
    "\\cong" : "\u2245",
    "\\backcong" : "\u224C",
    "\\ncong" : "\u2247",
    "\\propto" : "\u221D",
    "\\equiv" : "\u2261",
    "\\dotequiv" : "\u2A67",
    "\\superequiv" : "\u2263",
    "\\tbond" : "\u2261",
    "\\qbond" : "\u2263",
    "\\doteq" : "\u2250",
    "\\eqdot" : "\u2A66",
    "\\neq" : "\u2260",
    "\\approx" : "\u2248",
    "\\sim" : "\u223C",
    "\\backsim" : "\u223D",
    "\\simeq" : "\u2243",
    "\\nsimeq" : "\u2244",
    "\\nsim" : "\u2241",
    "\\nless" : "\u226E",
    "\\ngtr" : "\u226F",
    "\\leq" : "\u2264",
    "\\leqslant" : "\u2A7D",
    "\\geq" : "\u2265",
    "\\geqslant" : "\u2A7E",
    "\\nleq" : "\u2270",
    "\\ngeq" : "\u2271",
    "\\lneq" : "\u2A87",
    "\\lneqq" : "\u2268",
    "\\gneq" : "\u2A88",
    "\\gneqq" : "\u2269",
    "\\lnapprox" : "\u2A89",
    "\\gnapprox" : "\u2A8A",
    "\\lnsim" : "\u22E6",
    "\\gnsim" : "\u22E7",
    "\\ll" : "\u226A",
    "\\lll" : "\u22D8",
    "\\gg" : "\u226B",
    "\\ggg" : "\u22D9",
    "\\prec" : "\u227A",
    "\\succ" : "\u227B",
    "\\nprec" : "\u2280",
    "\\nsucc" : "\u2281",
    "\\preceq" : "\u227C",
    "\\succeq" : "\u227D",
    "\\precneqq" : "\u2AB5",
    "\\succneqq" : "\u2AB6",
    "\\precnapprox" : "\u2AB9",
    "\\succnapprox" : "\u2ABA",
    "\\precnsim" : "\u22E8",
    "\\succnsim" : "\u22E9",
    "\\perp" : "\u27C2",
    "\\Perp" : "\u2AEB",
    "\\parallel" : "\u2225",
    "\\nparallel" : "\u2226",
    "\\vvvert" : "\u2AF4",
    "\\nvvvert" : "\u2AF5",
    "\\mid" : "|",
    "\\nmid" : "\u2224",
    "\\asymp" : "\u224D",
    "\\neg" : "\u00AC",
    "\\bowtie" : "\u2A1D",
    "\\vdash" : "\u22A2",
    "\\nvdash" : "\u22AC",
    "\\dashv" : "\u22A3",
    "\\vDash" : "\u22A8",
    "\\Dashv" : "\u2AE4",
    "\\nvDash" : "\u22AD",
    "\\Vdash" : "\u22A9",
    "\\dashV" : "\u2AE3",
    "\\nVdash" : "\u22AE",
    "\\VDash" : "\u22AB",
    "\\DashV" : "\u2AE5",
    "\\nVDash" : "\u22AF",
    "\\triangleleft" : "\u22B2",
    "\\ntriangleleft" : "\u22EA",
    "\\triangleright" : "\u22B3",
    "\\ntriangleright" : "\u22EB",
    "\\ntrianglelefteq" : "\u22EC",
    "\\ntrianglerighteq" : "\u22ED",
    "\\trianglelefteq" : "\u22B4",
    "\\trianglerighteq" : "\u22B5",
    "\\triangleq" : "\u225C",
    "\\equest" : "\u225F",
    "\\lquest" : "\u2A7B",
    "\\rquest" : "\u2A7C",
    "\\mquest" : "\u225E",
    "\\vdots" : "\u22EE",
    "\\cdots" : "\u22EF",
    "\\udots" : "\u22F0",
    "\\ddots" : "\u22F1",
    "\\ldots" : "\u2026",
    "\\top" : "\u22A4",
    "\\bot" : "\u22A5",
    "\\between" : "\u226C",
    "\\therefore" : "\u2234",
    "\\because" : "\u2235",
    "\\squaredots" : "\u2237",
    "\\dotminus" : "\u2238",
    "\\max" : "max",
    "\\min" : "min",
    "\\grad" : "grad",
    "\\curl" : "curl",
    "\\ratio" : "\u2236",  // Same as ":", except with "!chem"

    // Arrows
    "\\Rightarrow" : "\u21D2",
    "\\Leftarrow" : "\u21D0",
    "\\nLeftarrow" : "\u21CD",
    "\\nRightarrow" : "\u21CF",
    "\\nLeftrightarrow" : "\u21CE",
    "\\Uparrow" : "\u21D1",
    "\\Downarrow" : "\u21D3",
    "\\Updownarrow" : "\u21D5",
    "\\rightarrow" : "\u2192",
    "\\to" : "\u2192",
    "\\longrightarrow" : "\u27F6",
    "\\leftarrow" : "\u2190",
    "\\longleftarrow" : "\u27F5",
    "\\leftrightarrow" : "\u2194",
    "\\nleftrightarrow" : "\u21AE",
    "\\uparrow" : "\u2191",
    "\\downarrow" : "\u2193",
    "\\updownarrow" : "\u2195",
    "\\nleftarrow" : "\u219A",
    "\\nrightarrow" : "\u219B",
    "\\Longleftarrow" : "\u27F8",
    "\\implies" : "\u27F9",
    "\\Longrightarrow" : "\u27F9",
    "\\Leftrightarrow" : "\u21D4",
    "\\iff" : "\u27FA",
    "\\mapsto" : "\u27FC",
    "\\rightleftharpoons" : "\u21CC",
    "\\leftrightharpoons" : "\u21CB",
    "\\rightharpoonup" : "\u21C0",
    "\\rightharpoondown" : "\u21C1",
    "\\leftharpoonup" : "\u21BC",
    "\\leftharpoondown" : "\u21BD",
    "\\upharpoonleft" : "\u21BF",
    "\\upharpoonright" : "\u21BE",
    "\\downharpoonleft" : "\u21C3",
    "\\downharpoonright" : "\u21C2", 
    "\\hookleftarrow" : "\u21A9",
    "\\hookrightarrow" : "\u21AA",
    "\\nearrow" : "\u2197",
    "\\searrow" : "\u2198",
    "\\swarrow" : "\u2199",
    "\\nwarrow" : "\u2196",
    "\\Nearrow" : "\u21D7",
    "\\Searrow" : "\u21D8",
    "\\Swarrow" : "\u21D9",
    "\\Nwarrow" : "\u21D6",
    "\\twoheadleftarrow" : "\u219E",
    "\\twoheadrightarrow" : "\u21A0",
    "\\twoheaduparrow" : "\u219F",
    "\\twoheaddownarrow" : "\u21A1",
    "\\Lsh" : "\u21B0",
    "\\Rsh" : "\u21B1",
    "\\leftleftarrows" : "\u21C7",
    "\\rightrightarrows" : "\u21C9",
    "\\rightrightrightarrows" : "\u21F6",
    "\\upuparrows" : "\u21C8",
    "\\downdownarrows" : "\u21CA",
    "\\leftrightarrows" : "\u21C6",
    "\\rightleftarrows" : "\u21C4",
    "\\Lleftarrow" : "\u21DA",
    "\\Rrightarrow" : "\u21DB",
    "\\Uuparrow" : "\u290A",
    "\\Ddownarrow" : "\u290B",
    "\\leftarrowtail" : "\u21A2",
    "\\rightarrowtail" : "\u21A3",
    "\\leftsquigarrow" : "\u21DC",
    "\\rightsquigarrow" : "\u21DD",
    "\\leftrightsquigarrow" : "\u21AD",
    "\\longrightsquigarrow" : "\u27FF",
    "\\looparrowleft" : "\u21AB",
    "\\looparrowright" : "\u21AC",
    "\\circlearrowleft" : "\u21BA",
    "\\circlearrowright" : "\u21BB",
    "\\curvearrowleft" : "\u21B6",
    "\\curvearrowright" : "\u21B7",
    "\\leftdasharrow" : "\u21E0",
    "\\rightdasharrow" : "\u21E2",
    "\\updasharrow" : "\u21E1",
    "\\downdasharrow" : "\u21E3",
    "\\tildeabovearrow" : "\u2972",
    "\\tildebelowarrow" : "\u2974",
    "\\equalabovearrow" : "\u2971",

    // Hebrew alphabet
    "\\aleph" : "\u2135",
    "\\beth" : "\u2136",
    "\\gimel" : "\u2137",
    "\\dalet" : "\u2138",

    // Convert text
    "\\mathbb" : mathbb,
    "\\mathbf" : mathbf,
    "\\mathcal" : mathcal,
    "\\mathscr" : mathcal,  // In some OS, mathcal = *actual* mathcal and in others mathcal = *actual* mathscr
                            // Sometimes, mathbf{mathcal} = mathscr or vice versa, depending on OS
    "\\mathfrak" : mathfrak,
    "^" : superscript,
    "_" : subscript,
    "\\mathrm" : text,
    "\\text" : text,
    "\\textbf" : textbf,
    "\\textit" : textit,
    "\\texttt" : texttt,
    "\\textsc" : textsc,

    // Spaces
    "\\hspace" : hspace,
    "\\vskip" : vskip,
    "\\phantom" : phantom,
    "\\mathord" : mathord,

    // Square root and fractions
    "\\sqrt" : sqrt,
    "\\frac" : frac,
    "\\frac*" : singleCharFrac,

    // Combining symbols
    "\\overline" : overline,
    "\\underline" : underline,
    "\\underarrow" : underarrow,
    "\\underharpoon" : underharpoon,
    "\\overfrown" : overfrown,
    "\\oversmile" : oversmile,
    "\\undersmile" : undersmile,
    "\\hat" : hat,
    "\\not" : not,
    "\\tilde" : tilde,
    "\\vec" : vec,
    "\\hvec" : hvec,
    "\\dot" : dot,
    "\\ddot" : ddot,
    "\\acute" : acute,
    "\\grave" : grave,
    "\\stackrel" : stackrel,
    "\\overset" : overset,
    "\\underset" : underset,
    "\\check" : caron,
    "\\breve" : breve,
    "\\bar" : bar,

    // For Lewis Notation
    "\\mdot" : "\u2E31",
    "\\mddot" : "\u003A",

    // Chess
    "\\wking" : "\u2654",
    "\\wqueen" : "\u2655",
    "\\wrook" : "\u2656",
    "\\wbishop" : "\u2657",
    "\\wknight" :"\u2658",
    "\\wpawn" : "\u2659",
    "\\bking" : "\u265A",
    "\\bqueen" : "\u265B",
    "\\brook" : "\u265C",
    "\\bbishop" : "\u265D",
    "\\bknight" :"\u265E",
    "\\bpawn" : "\u265F",

    // Card games
    "\\bspade" : "\u2660",
    "\\wheart" : "\u2661",
    "\\wdiamond" : "\u2662",
    "\\bclub" : "\u2663",
    "\\wspade" : "\u2664",
    "\\bheart" : "\u2665",
    "\\bdiamond" : "\u2666",
    "\\wclub" : "\u2667",

    // Money
    "\\dollar" : "\u0024",
    "\\cent" : "\u00A2",
    "\\pound" : "\u00A3",
    "\\yen" : "\u00A5",
    "\\franc" : "\u20A3",
    "\\euro" : "\u20AC",
    "\\peso" : "\u20B1",
    "\\bitcoin" : "\u20BF",
    "\\austral" : "\u20B3",
    "\\ruble" : "\u20BD",
    "\\hryvnia" : "\u20B4",
    "\\rupee" : "\u20B9",
    "\\lira" : "\u20AA",
    "\\tlira" : "\u20A9",
    "\\won" : "\u20A9",
    "\\baht" : "\u0E3F",

    // Non italic letters
    "\\A" : "A",
    "\\a" : "a",
    "\\B" : "B",
    "\\b" : "b",
    "\\C" : "C",
    "\\c" : "c",
    "\\D" : "D",
    "\\d" : "d",
    "\\E" : "E",
    "\\e" : "e",
    "\\F" : "F",
    "\\f" : "f",
    "\\G" : "G",
    "\\g" : "g",
    "\\H" : "H",
    "\\h" : "h",
    "\\I" : "I",
    "\\i" : "i",
    "\\J" : "J",
    "\\j" : "j",
    "\\K" : "K",
    "\\k" : "k",
    "\\L" : "L",
    "\\l" : "l",
    "\\M" : "M",
    "\\m" : "m",
    "\\N" : "N",
    "\\n" : "n",
    "\\O" : "O",
    "\\o" : "o",
    "\\P" : "P",
    "\\p" : "p",
    "\\Q" : "Q",
    "\\q" : "q",
    "\\R" : "R",
    "\\r" : "r",
    "\\S" : "S",
    "\\s" : "s",
    "\\T" : "T",
    "\\t" : "t",
    "\\U" : "U",
    "\\u" : "u",
    "\\V" : "V",
    "\\v" : "v",
    "\\W" : "W",
    "\\w" : "w",
    "\\X" : "X",
    "\\x" : "x",
    "\\Y" : "Y",
    "\\y" : "y",
    "\\Z" : "Z",
    "\\z" : "z",

    "\\^" : "^",
    "\\_" : "_",

    // Matrix
    "\\matrix" : matrix,
    "\\id1" : "["+spacesChar.add+"1"+spacesChar.add+"]",
    "\\id2" : "\u23A1"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"\u23A4 \u000A \u23A3 "+
              spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"\u23A6",
    "\\id3" : "\u23A1"+spacesChar.add+"1"+spacesChar.add+""+spacesChar.add+"0"+spacesChar.add+"\u23A4 \u000A \u23A2"+
              spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"\u23A5 \u000A \u23A3"+
              spacesChar.add+"0"+spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"\u23A6",
    "\\id4" : "\u23A1"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"0"+spacesChar.add+"0"+spacesChar.add+"\u23A4 \u000A \u23A2"+
              spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"0"+spacesChar.add+"\u23A5 \u000A \u23A2"+spacesChar.add+
              "0"+spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"\u23A5 \u000A \u23A3"+spacesChar.add+"0"+spacesChar.add+
              "0"+spacesChar.add+"0"+spacesChar.add+"1"+spacesChar.add+"\u23A6",
    "\\idn" : "\u23A1"+spacesChar.add+"1"+spacesChar.add+"0"+spacesChar.add+"\u22EF"+spacesChar.add+"0"+spacesChar.add+"\u23A4 \u000A \u23A2"+spacesChar.add+
              "0"+spacesChar.add+"1"+spacesChar.add+"\u22EF"+spacesChar.add+"0"+spacesChar.add+"\u23A5 \u000A \u23A2"+spacesChar.add+spacesChar.add+"\u22EE"+
              spacesChar.add+spacesChar.add+"\u22EE"+spacesChar.add+spacesChar.add+"\u22F1"+spacesChar.add+spacesChar.add+"\u22EE"+spacesChar.add+
              "\u23A5 \u000A \u23A3"+spacesChar.add+"0"+spacesChar.add+"0"+spacesChar.add+"\u22EF"+spacesChar.add+"1"+spacesChar.add+"\u23A6",
    // To build your own
    "\\mlceil" : "\u23A1",
    "\\mrceil" : "\u23A4",
    "\\mlmid" : "\u23A2",
    "\\mrmid" : "\u23A5",
    "\\mlfloor" : "\u23A3",
    "\\mrfloor" : "\u23A6",

    // Music
    "\\flat" : "\u{1D12C}",
    "\\natural" : "\u{1D12E}",
    "\\sharp" : "\u{1D130}",
    "\\eightnote" : "\u{1D160}",
    "\\sixteenthnote" : "\u{1D161}",
    "\\halfnote" : "\u{1D15E}",
    "\\quarternote" : "\u{1D15F}",
    "\\fullnote" : "\u{1D15D}",
    "\\doublenote" : "\u266B",
    "\\trebleclef" : "\u{1D11E}",
    
    // Box drawing
    "\\boxh" : "\u2500",
    "\\boxbfh" : "\u2501",
    "\\boxH" : "\u2550",
    "\\boxv" : "\u2502",
    "\\boxbfv" : "\u2503",
    "\\boxV" : "\u2551",
    "\\boxdr" : "\u250C",
    "\\boxbfdr" : "\u250F",
    "\\boxDR" : "\u2554",
    "\\boxdl" : "\u2510",
    "\\boxbfdl" : "\u2513",
    "\\boxDL" : "\u2557",
    "\\boxur" : "\u2514",
    "\\boxbfur" : "\u2517",
    "\\boxUR" : "\u255A",
    "\\boxul" : "\u2518",
    "\\boxbful" : "\u251B",
    "\\boxUL" : "\u255D",
    "\\boxvr" : "\u251C",
    "\\boxbfvr" : "\u2523",
    "\\boxVR" : "\u2560",
    "\\boxvl" : "\u2524",
    "\\boxbfvl" : "\u252B",
    "\\boxVL" : "\u2563",
    "\\boxdh" : "\u252C",
    "\\boxbfdh" : "\u2533",
    "\\boxDH" : "\u2566",
    "\\boxuh" : "\u2534",
    "\\boxbfuh" : "\u253B",
    "\\boxUH" : "\u2569",
    "\\boxvh" : "\u253C",
    "\\boxbfvh" : "\u254B",
    "\\boxVH" : "\u256C",

    // Other symbols
    "\\LaTeX" : "𝐿ᴬ𝑇ᴇ𝑋",
    "\\TeX" : "𝑇ᴇ𝑋",
    "\\MatTalX" : "𝑀ᴀᴛ𝑇ᴀʟ𝑋",
    "\\CaMuS" : "𝐶ᴬ𝑀ᴜ𝑆",  // https://camus.espaceweb.usherbrooke.ca/index.html
    "\\infty" : "\u221E",
    "\\iinfin" : "\u29DC",
    "\\tieinfty" : "\u29DD",
    "\\nvinfty" : "\u29DE",
    "\\acidfree" : "\u267E",
    "\\radioactive" : "\u2622",
    "\\biohazard" : "\u2623",
    "\\atom" : "\u269B",
    "\\permil" : "‰",
    "\\textperthousand" : "‰",  // Weird command name, but trying to respect LaTeX's nomenclature
    "\\perthousand" : "‱",
    "\\angle" : "\u2220",
    "\\measuredangle" : "\u2221",
    "\\sphericalangle" : "\u2222",
    "\\rightangle" : "\u299C",
    "\\hbar" : "\u210F",
    "\\ell" : "\u2113",
    "\\dagger" : "\u2020",
    "\\ddagger" : "\u2021",
    "\\dddagger" : "\u2E4B",
    "\\hermitian" : "\u22B9",
    "\\qc" : "\u269C",
    "\\section" : "\u00A7",
    "\\paragraph" : "\u00B6",
    "\\copyright" : "\u00A9",
    "\\registered" : "\u00AE",
    "\\wp" : "\u2118",
    "\\laplace" : "\u2112",
    "\\bloch" : "\u212C",
    "\\im" : "\u2111",
    "\\fourier" : "\u2131",
    "\\angstrom" : "\u212B",
    "\\mho" : "\u2127",
    "\\endash" : "\u2013",
    "\\emdash" : "\u2014",
    "\\bullet" : "\u2219",
    "\\textbullet" : "\u2022",
    "\\bigbullet" : "\u25CF",
    "\\langle" : "\u27E8",
    "\\rangle" : "\u27E9",
    "\\llangle" : "\u27EA",
    "\\rrangle" : "\u27EB",
    "\\lceil" : "\u2308",
    "\\rceil" : "\u2309",
    "\\lfloor" : "\u230A",
    "\\rfloor" : "\u230B",
    "\\lBrace" : "\u2983",
    "\\rBrace" : "\u2984",
    "\\%" : "%",
    "\\{" : "{",
    "\\}" : "}",
    "\\$" : "$",
    "\\#" : "#",
    "\\backslash" : "\\",
    "\\llbracket" : "\u27E6",
    "\\rrbracket" : "\u27E7",
    "\\llparenthesis" : "\u2985",
    "\\rrparenthesis" : "\u2986",
    "\\frown" : "\u2322",
    "\\smile" : "\u2323",
    "\\qed" : "\u220E",
    "\\blacksquare" : "\u25A0",
    "\\square" : "\u25A1",
    "\\lightning" : "\u21AF",
    "\\dbend" : "\u2621",
    "\\male" : "\u2642",
    "\\female" : "\u2640",
    "\\Hermaphrodite" : "\u26A5",
    "\\neuter" : "\u26B2",
    "\\malemale" : "\u26A3",
    "\\femalefemale" : "\u26A2",
    "\\femalemale" : "\u26A4",
    "\\" : "\\",
    "\\:" : spacesChar.add,
    "\\;" : spacesChar.add+spacesChar.add,
    "\\quad" : spacesChar.add+spacesChar.add+spacesChar.add,
    "\\qquad" : spacesChar.add+spacesChar.add+spacesChar.add+spacesChar.add,
    "\\!" : spacesChar.remove,
    "\\colon" : "\u003A",
    "\\\\" : "\u000A",
    "\\linebreak" : "\u000A",
    "\\newline" : "\u000A",
    "\\tab" : "\u0009"
};

// Standard dict for greek letters
const stdGreek = {
    "\\Alpha" : "\u{1D6E2}",
    "\\alpha" : "\u{1D6FC}",
    "\\Beta" : "\u{1D6E3}",
    "\\beta" : "\u{1D6FD}",
    "\\Gamma" : "\u{1D6E4}",
    "\\gamma" : "\u{1D6FE}",
    "\\Delta" : "\u0394",
    "\\varDelta" : "\u{1D6E5}",
    "\\delta" : "\u{1D6FF}",
    "\\Epsilon" : "\u{1D6E6}",
    "\\epsilon" : "\u03F5",
    "\\varepsilon" : "\u03B5",
    "\\Zeta" : "\u{1D6E7}",
    "\\zeta" : "\u{1D701}",
    "\\Eta" : "\u{1D6E8}",
    "\\eta" : "\u{1D702}",
    "\\Theta" : "\u0398",
    "\\theta" : "\u{1D703}",
    "\\vartheta" : "\u{1D717}",
    "\\Iota" : "\u{1D6EA}",
    "\\iota" : "\u{1D704}",
    "\\Kappa" : "\u{1D6EB}",
    "\\kappa" : "\u{1D705}",
    "\\varkappa" : "\u{1D718}",
    "\\Lambda" : "\u{1D6EC}",
    "\\lambda" : "\u{1D706}",
    "\\Mu" : "\u{1D6ED}",
    "\\mu" : "\u{1D707}",
    "\\Nu" : "\u{1D6EE}",
    "\\nu" : "\u{1D708}",
    "\\Xi" : "\u039E",
    "\\xi" : "\u{1D709}",
    "\\Omicron" : "\u{1D6F0}",
    "\\omicron" : "\u{1D70A}",
    "\\Pi" : "\u{1D6F1}",
    "\\pi" : "\u{1D70B}",
    "\\varpi" : "\u{1D71B}",
    "\\Rho" : "\u{1D6F2}",
    "\\rho" : "\u{1D70C}",
    "\\varrho" : "\u{1D71A}",
    "\\Sigma" : "\u{1D6F4}",
    "\\sigma" : "\u{1D70E}",
    "\\varsigma" : "\u{1D70D}",
    "\\Tau" : "\u{1D6F5}",
    "\\tau" : "\u{1D70F}",
    "\\Upsilon" : "\u{1D6F6}",
    "\\upsilon" : "\u{1D710}",
    "\\Phi" : "\u03A6",
    "\\phi" : "\u{1D719}",
    "\\varphi" : "\u{1D711}",
    "\\Chi" : "\u{1D6F8}",
    "\\chi" : "\u{1D712}",
    "\\Psi" : "\u{1D6F9}",
    "\\psi" : "\u{1D713}",
    "\\Omega" : "\u2126",
    "\\omega" : "\u{1D714}"
};

// Greek letters if the user wants basic UTF-8 characters (nostyle)
const noStyleGreek = {
    "\\Alpha" : "\u0391",
    "\\alpha" : "\u03B1",
    "\\Beta" : "\u0392",
    "\\beta" : "\u03B2",
    "\\Gamma" : "\u0393",
    "\\gamma" : "\u03B3",
    "\\Delta" : "\u0394",
    "\\varDelta" : "\u{1D6E5}",
    "\\delta" : "\u03B4",
    "\\Epsilon" : "\u0395",
    "\\epsilon" : "\u03F5",
    "\\varepsilon" : "\u03B5",
    "\\Zeta" : "\u0396",
    "\\zeta" : "\u03B6",
    "\\Eta" : "\u0397",
    "\\eta" : "\u03B7",
    "\\Theta" : "\u0398",
    "\\theta" : "\u03B8",
    "\\vartheta" : "\u03D1",
    "\\Iota" : "\u0399",
    "\\iota" : "\u03B9",
    "\\Kappa" : "\u039A",
    "\\kappa" : "\u03BA",
    "\\varkappa" : "\u03F0",
    "\\Lambda" : "\u039B",
    "\\lambda" : "\u03BB",
    "\\Mu" : "\u039C",
    "\\mu" : "\u03BC",
    "\\Nu" : "\u039D",
    "\\nu" : "\u03BD",
    "\\Xi" : "\u039E",
    "\\xi" : "\u03BE",
    "\\Omicron" : "\u039F",
    "\\omicron" : "\u03BF",
    "\\Pi" : "\u03A0",
    "\\pi" : "\u03C0",
    "\\varpi" : "\u03D6",
    "\\Rho" : "\u03A1",
    "\\rho" : "\u03C1",
    "\\varrho" : "\u03F1",
    "\\Sigma" : "\u03A3",
    "\\sigma" : "\u03C3",
    "\\varsigma" : "\u03C2",
    "\\Tau" : "\u03A4",
    "\\tau" : "\u03C4",
    "\\Upsilon" : "\u03A5",
    "\\upsilon" : "\u03C5",
    "\\Phi" : "\u03A6",
    "\\phi" : "\u03D5",
    "\\varphi" : "\u03C6",
    "\\Chi" : "\u03A7",
    "\\chi" : "\u03C7",
    "\\Psi" : "\u03A8",
    "\\psi" : "\u03C8",
    "\\Omega" : "\u03A9",
    "\\omega" : "\u03C9"
};

// Names that were once misspelled, kept so a text written with the old one still converts
// Left out of defaultDict on purpose: they convert, but there is no reason to suggest them
export const oldNames = {
    "\\longrightsquiglearrow" : "\u27FF"   // \longrightsquigarrow
};

// Default dict (in math mode), used in the completion popup
export const defaultDict = {...mathDictionary, ...stdGreek};

const textCommands = {
    "\\LaTeX" : "𝐿ᴬ𝑇ᴇ𝑋",
    "\\TeX" : "𝑇ᴇ𝑋",
    "\\MatTalX" : "𝑀ᴀᴛ𝑇ᴀʟ𝑋",
    "\\CaMuS" : "𝐶ᴬ𝑀ᴜ𝑆",  // https://camus.espaceweb.usherbrooke.ca/index.html
    "\\textbullet" : "\u2022",
    "\\section" : "\u00A7",
    "\\paragraph" : "\u00B6",
    "\\copyright" : "\u00A9",
    "\\registered" : "\u00AE",
    "\\%" : "%",
    "\\#" : "#",
    "\\{" : "{",
    "\\}" : "}",
    "\\$" : "$",
    "\\backslash" : "\\",
    "\\textbackslash" : "\\",
    "\\\\" : "\u000A",
    "\\linebreak" : "\u000A",
    "\\newline" : "\u000A",
    "\\tab" : "\u0009",
    "\\!" : spacesChar.remove,
    "\\O" : "\u00D8",
    "\\o" : "\u00F8",
    "\\i" : "\u0131",
    "\\j" : "\u0237",
    "\\L" : "\u0141",
    "\\l" : "\u0142",
    "\\OE" : "\u0152",
    "\\oe" : "\u0153",
    "\\AE" : "\u00C6",
    "\\ae" : "\u00E6",
    "\\textbf" : textbf,
    "\\textit" : textit,
    "\\texttt" : texttt,
    "\\textsc" : textsc,
    "\\hspace" : hspace,
    "\\vskip" : vskip,
    "\\`" : grave,
    "\\'" : acute,
    "\\^" : hat,
    '\\"' : ddot,
    "\\H" : doubleAccute,
    "\\~" : tilde,
    "\\c" : cedilla,
    "\\k" : ogonek,
    "\\=" : bar,
    "\\b" : underline,
    "\\." : dot,
    "\\d" : dotBelow,
    "\\r" : ringAbove,
    "\\u" : breve,
    "\\v" : caron,
    "\\today" : today()
};

// Superscript is used (by the superscript function) to convert characters to the corresponding superscript character
const Superscript = {
    "0" : "\u2070",
    "1" : "\u00B9",
    "2" : "\u00B2",
    "3" : "\u00B3",
    "4" : "\u2074",
    "5" : "\u2075",
    "6" : "\u2076",
    "7" : "\u2077",
    "8" : "\u2078",
    "9" : "\u2079",

    "+" : "\u207A",
    "-" : "\u207B",
    "\u2212" : "\u207B",
    "=" : "\u207C",
    "≠" : "ᙿ",
    "(" : "\u207D",
    ")" : "\u207E",
    "\\" : "ᐠ",
    "∖" : "ᐠ",
    "/" : "ᐟ",
    "." : "ᐧ",
    "," : "\u02D2",
    "!" : "ꜝ",
    "$" : "ᙚ",
    "⟂" : "ᗮ",
    "×" : "ᕁ",
    "∫" : "ᶴ",
    "∘" : "°",
    "∞" : spacesChar.add+"\u1AB2"+spacesChar.add,  // Only works on certain website/apps
    "∅" : "\u{1D1A9}",
    "*" : "*",
    "<" : "ᑉ",
    "∥" : "ᐦ",
    "⊂" : "ᒼ",
    "⊃" : "ᐣ",
    "∪" : "ᐡ",
    "∩" : "ᐢ",
    "∨" : "ᘁ",
    "∧" : "ᶺ",
    "⌊" : "ᒻ",
    "⌋" : "ᒽ",
    "℧" : "ᶷ",
    "↑" : "ꜛ",
    "↓" : "ꜜ",
    "Œ" : "𐞣",
    "œ" : "ꟹ",
    "æ" : "𐞃",

    "A" : "ᴬ",
    "a" : "ᵃ",
    "B" : "ᴮ",
    "b" : "ᵇ",
    "C" : "ᶜ",
    "c" : "ᶜ",
    "D" : "ᴰ",
    "d" : "ᵈ",
    "E" : "ᴱ",
    "e" : "ᵉ",
    "f" : "ᶠ",
    "G" : "ᴳ",
    "g" : "ᵍ",
    "H" : "ᴴ",
    "h" : "ʰ",
    "I" : "ᴵ",
    "i" : "ⁱ",
    "J" : "ᴶ",
    "j" : "ʲ",
    "K" : "ᴷ",
    "k" : "ᵏ",
    "L" : "ᴸ",
    "l" : "ˡ",
    "M" : "ᴹ",
    "m" : "ᵐ",
    "N" : "ᴺ",
    "n" : "ⁿ",
    "O" : "ᴼ",
    "o" : "ᵒ",
    "P" : "ᴾ",
    "p" : "ᵖ",
    "R" : "ᴿ",
    "r" : "ʳ",
    "S" : "ˢ",
    "s" : "ˢ",
    "T" : "ᵀ",
    "t" : "ᵗ",
    "U" : "ᵁ",
    "u" : "ᵘ",
    "V" : "ⱽ",
    "v" : "ᵛ",
    "W" : "ᵂ",
    "w" : "ʷ",
    "X" : "ˣ",
    "x" : "ˣ",
    "y" : "ʸ",
    "Z" : "ᙆ",
    "z" : "ᶻ",

    "𝐴" : "ᴬ",
    "𝑎" : "ᵃ",
    "𝐵" : "ᴮ",
    "𝑏" : "ᵇ",
    "𝐶" : "ᶜ",
    "𝑐" : "ᶜ",
    "𝐷" : "ᴰ",
    "𝑑" : "ᵈ",
    "𝐸" : "ᴱ",
    "𝑒" : "ᵉ",
    "𝑓" : "ᶠ",
    "𝐺" : "ᴳ",
    "𝑔" : "ᵍ",
    "𝐻" : "ᴴ",
    "ℎ" : "ʰ",
    "𝐼" : "ᴵ",
    "𝑖" : "ⁱ",
    "𝐽" : "ᴶ",
    "𝑗" : "ʲ",
    "𝐾" : "ᴷ",
    "𝑘" : "ᵏ",
    "𝐿" : "ᴸ",
    "𝑙" : "ˡ",
    "𝑀" : "ᴹ",
    "𝑚" : "ᵐ",
    "𝑁" : "ᴺ",
    "𝑛" : "ⁿ",
    "𝑂" : "ᴼ",
    "𝑜" : "ᵒ",
    "𝑃" : "ᴾ",
    "𝑝" : "ᵖ",
    "𝑅" : "ᴿ",
    "𝑟" : "ʳ",
    "𝑆" : "ˢ",
    "𝑠" : "ˢ",
    "𝑇" : "ᵀ",
    "𝑡" : "ᵗ",
    "𝑈" : "ᵁ",
    "𝑢" : "ᵘ",
    "𝑉" : "ⱽ",
    "𝑣" : "ᵛ",
    "𝑊" : "ᵂ",
    "𝑤" : "ʷ",
    "𝑋" : "ˣ",
    "𝑥" : "ˣ",
    "𝑦" : "ʸ",
    "𝑍" : "ᶻ",
    "𝑧" : "ᶻ",

    "𝛽" : "\u1D5D",
    "β" : "\u1D5D", 
    "𝛤" : "ᣘ",
    "Γ" : "ᣘ",
    "𝛾" : "\u1D5E",
    "γ" : "\u1D5E",
    "Δ" : "ᐞ",
    "δ" : "\u1D5F",
    "𝛿" : "\u1D5F",
    "ϵ" : "ᵋ",
    "ε" : "ᵋ",
    "𝛬" : "ᣔ",
    "Λ" : "ᣔ",
    "𝜃" : "\u1DBF",
    "θ" : "\u1DBF", 
    "𝜄" : "ᶥ",
    "ι" : "ᶥ",
    "𝜈" : "ᶹ",
    "ν" : "ᶹ",
    "𝜎" : "ᣙ",
    "σ" : "ᣙ",
    "Φ" : "ᶲ",
    "𝜙" : "ᶲ",
    "ϕ" : "ᶲ",
    "𝜑" : "\u1D60",
    "φ" : "\u1D60",
    "𝜌" : "ᣖ",
    "ρ" : "ᣖ",
    "𝜒" : "\u1D61",
    "χ" : "\u1D61",

    "\u2710" : spacesChar.add,
    "\u270E" : spacesChar.remove,
    " " : " ",
    "\u000A" : "\u000A",
    "" : ""
};

// Subscript is used (by the subscript function) to convert characters to the corresponding subscript character
const Subscript = {
    "0" : "\u2080",
    "1" : "\u2081",
    "2" : "\u2082",
    "3" : "\u2083",
    "4" : "\u2084",
    "5" : "\u2085",
    "6" : "\u2086",
    "7" : "\u2087",
    "8" : "\u2088",
    "9" : "\u2089",

    "+" : "\u208A",
    "-" : "\u208B",
    "\u2212" : "\u208B",
    "=" : "\u208C",
    "(" : "\u208D",
    ")" : "\u208E",
    "," : spacesChar.add+"\u0326"+spacesChar.add,
    "." : spacesChar.add+"\u0323"+spacesChar.add,
    "×" : "᙮",

    "a" : "\u2090",
    "e" : "\u2091",
    "h" : "\u2095",
    "i" : "\u1D62",
    "j" : "ⱼ",
    "k" : "\u2096",
    "l" : "\u2097",
    "m" : "\u2098",
    "n" : "\u2099",
    "o" : "\u2092",
    "p" : "\u209A",
    "r" : "ᵣ",
    "s" : "\u209B",
    "t" : "\u209C",
    "u" : "ᵤ",
    "v" : "ᵥ",
    "X" : "\u2093",
    "x" : "\u2093",

    "𝑎" : "\u2090",
    "𝑒" : "\u2091",
    "ℎ" : "\u2095",
    "𝑖" : "\u1D62",
    "𝑗" : "ⱼ",
    "𝑘" : "\u2096",
    "𝑙" : "\u2097",
    "𝑚" : "\u2098",
    "𝑛" : "\u2099",
    "𝑜" : "\u2092",
    "𝑝" : "\u209A",
    "𝑟" : "ᵣ",
    "𝑠" : "\u209B",
    "𝑡" : "\u209C",
    "𝑢" : "ᵤ",
    "𝑣" : "ᵥ",
    "𝑋" : "\u2093",
    "𝑥" : "\u2093",

    "𝛽" : "\u1D66",
    "β" : "\u1D66",
    "𝛾" : "\u1D67",
    "γ" : "\u1D67",
    "𝜌" : "\u1D68",
    "ρ" : "\u1D68",
    "𝜑" : "\u1D69",
    "φ" : "\u1D69",
    "𝜙" : "\u1D69",
    "ϕ" : "\u1D69",
    "𝜒" : "\u1D6A",
    "χ" : "\u1D6A",

    "→" : spacesChar.add+spacesChar.add+"\u0362"+spacesChar.add+spacesChar.add,
    "∞" : spacesChar.add+"\u035A"+spacesChar.add,

    // The following are actually small caps, since they don't exist in subscript
    "A" : "ᴀ",
    "B" : "ʙ",
    "C" : "ᴄ",
    "D" : "ᴅ",
    "E" : "ᴇ",
    "F" : "ꜰ",
    "G" : "ɢ",
    "H" : "ʜ",
    "I" : "ɪ",
    "J" : "ᴊ",
    "K" : "ᴋ",
    "L" : "ʟ",
    "M" : "ᴍ",
    "N" : "ɴ",
    "O" : "ᴏ",
    "P" : "ᴘ",
    "Q" : "ꞯ",
    "R" : "ʀ",
    "S" : "ѕ",
    "T" : "ᴛ",
    "U" : "ᴜ",
    "V" : "ᴠ",
    "W" : "ᴡ",
    "Y" : "ʏ",
    "Z" : "ᴢ",

    "𝐴" : "ᴀ",
    "𝐵" : "ʙ",
    "𝐶" : "ᴄ",
    "𝐷" : "ᴅ",
    "𝐸" : "ᴇ",
    "𝐹" : "ꜰ",
    "𝐺" : "ɢ",
    "𝐻" : "ʜ",
    "𝐼" : "ɪ",
    "𝐽" : "ᴊ",
    "𝐾" : "ᴋ",
    "𝐿" : "ʟ",
    "𝑀" : "ᴍ",
    "𝑁" : "ɴ",
    "𝑂" : "ᴏ",
    "𝑃" : "ᴘ",
    "𝑄" : "ꞯ",
    "𝑅" : "ʀ",
    "𝑆" : "ѕ",
    "𝑇" : "ᴛ",
    "𝑈" : "ᴜ",
    "𝑉" : "ᴠ",
    "𝑊" : "ᴡ",
    "𝑌" : "ʏ",
    "𝑍" : "ᴢ",

    "Γ" : "ᴦ",
    "Λ" : "ᴧ",
    "Π" : "ᴨ",
    "Ψ" : "ᴪ",
    "Ω" : "ꭥ",

    "𝛤" : "ᴦ",
    "𝛬" : "ᴧ",
    "𝛱" : "ᴨ",
    "𝛹" : "ᴪ",
    "Ω" : "ꭥ",

    "\u2710" : spacesChar.add,
    "\u270E" : spacesChar.remove,
    " " : " ",
    "\u000A" : "\u000A",
    "" : ""
};

// Dict with characters and their corresponding symbol that can be combined and put above another symbol
const Above = {
    "." : "\u0307",
    ":" : "\u0308",
    "\u2236" : "\u0308",
    "-" : "\u0305",
    "−" : "\u0305",
    "`" : "\u0300",
    "´" : "\u0301",
    "^" : "\u0302",
    "=" : "\u033F",
    "∼" : "\u0303",
    "∞" : "\u1AB2", // Only works on certain website/apps
    "∘" : "\u030A",
    "°" : "\u030A",
    "a" : "\u0363",
    "𝑎" : "\u0363",
    "b" : "\u1DE8",
    "𝑏" : "\u1DE8",
    "c" : "\u0368",
    "𝑐" : "\u0368",
    "d" : "\u0369",
    "𝑑" : "\u0369",
    "e" : "\u0364",
    "𝑒" : "\u0364",
    "f" : "\u1DEB",
    "𝑓" : "\u1DEB",
    "h" : "\u036A",
    "ℎ" : "\u036A",
    "i" : "\u0365",
    "𝑖" : "\u0365",
    "k" : "\u1DDC",  // Only works on certain website/apps
    "𝑘" : "\u1DDC",
    "m" : "\u036B",
    "𝑚" : "\u036B",
    "N" : "\u1DE1",
    "𝑁" : "\u1DE1",
    "n" : "\u1DE0",  // Only works on certain website/apps
    "𝑛" : "\u1DE0",
    "o" : "\u0366",
    "𝑜" : "\u0366",
    "p" : "\u1DEE",
    "𝑝" : "\u1DEE",
    "R" : "\u1DE2",
    "𝑅" : "\u1DE2",
    "r" : "\u036C",
    "𝑟" : "\u036C",
    "t" : "\u036D",
    "𝑡" : "\u036D",
    "u" : "\u0367",
    "𝑢" : "\u0367",
    "v" : "\u036E",
    "𝑣" : "\u036E",
    "x" : "\u036F",
    "𝑥" : "\u036F",

    "𝛼" : "\u1DE7",
    "α" : "\u1DE7",
    "𝛽" : "\u1DE9",
    "β" : "\u1DE9",

    "↼" : "\u20D0",
    "⇀" : "\u20D1",
    "↔" : "\u20E1",
    "↶" : "\u20D4",
    "↷" : "\u20D5",
    "←" : "\u20D6",
    "→" : "\u20D7",
    "↓" : "\u1AB3",
    "∴" : "\u1AB4",
    "⋯" : "\u20DB",
    "…" : "\u20DB",
    " " : " ",
    "\u000A" : "\u000A",
    "" : ""
};

// Dict with characters and their corresponding symbol that can be combined and put below another symbol
const Below = {
    "." : "\u0323",
    ":" : "\u0324",
    "\u2236" : "\u0324",
    "-" : "\u0332",
    "−" : "\u0332",
    "=" : "\u0333",
    "m" : "\u1AC0",
    "𝑚" : "\u1AC0",
    "x" : "\u0353",
    "𝑥" : "\u0353",
    "w" : "\u1ABF",
    "𝑤" : "\u1ABF",
    "↽" : "\u20ED",
    "⇁" : "\u20EC",
    "←" : "\u20EE",
    "→" : "\u20EF",
    "↔" : "\u034D",
    " " : " ",
    "\u000A" : "\u000A",
    "" : ""
};

// Regular dict used to convert characters that are not a command
// Automatically convert text into a mathematical font
const lettersMath = {
    "+" : "\u002B",
    "-" : "\u2212",
    "=" : "\u003D",
    "'" : "\u2032",
    '"' : "\u2033",
    "/" : "/",
    "\\" : "\\",
    "," : ",",
    "." : ".",
    "°" : "°",
    "|" : "|",
    "!" : "!",
    "?" : "?",
    "*" : "*",
    "@" : "@",
    "&" : "&",
    "(" : "(",
    ")" : ")",
    "{" : "{",
    "}" : "}",
    "[" : "[",
    "]" : "]",
    "<" : "<",
    ">" : ">",
    "%" : "%",
    "#" : "#",
    "~" : "~",
    "¬" : "¬",
    ":" : "\u2236",
    ";" : ";",
    "…" : "…",
    "0" : "0",
    "1" : "1",
    "2" : "2",
    "3" : "3",
    "4" : "4",
    "5" : "5",
    "6" : "6",
    "7" : "7",
    "8" : "8",
    "9" : "9",
    "A" : "\u{1D434}",
    "a" : "\u{1D44E}",
    "B" : "\u{1D435}",
    "b" : "\u{1D44F}",
    "C" : "\u{1D436}",
    "c" : "\u{1D450}",
    "D" : "\u{1D437}",
    "d" : "\u{1D451}",
    "E" : "\u{1D438}",
    "e" : "\u{1D452}",
    "F" : "\u{1D439}",
    "f" : "\u{1D453}",
    "G" : "\u{1D43A}",
    "g" : "\u{1D454}",
    "H" : "\u{1D43B}",
    "h" : "\u210E",
    "I" : "\u{1D43C}",
    "i" : "\u{1D456}",
    "J" : "\u{1D43D}",
    "j" : "\u{1D457}",
    "K" : "\u{1D43E}",
    "k" : "\u{1D458}",
    "L" : "\u{1D43F}",
    "l" : "\u{1D459}",
    "M" : "\u{1D440}",
    "m" : "\u{1D45A}",
    "N" : "\u{1D441}",
    "n" : "\u{1D45B}",
    "O" : "\u{1D442}",
    "o" : "\u{1D45C}",
    "P" : "\u{1D443}",
    "p" : "\u{1D45D}",
    "Q" : "\u{1D444}",
    "q" : "\u{1D45E}",
    "R" : "\u{1D445}",
    "r" : "\u{1D45F}",
    "S" : "\u{1D446}",
    "s" : "\u{1D460}",
    "T" : "\u{1D447}",
    "t" : "\u{1D461}",
    "U" : "\u{1D448}",
    "u" : "\u{1D462}",
    "V" : "\u{1D449}",
    "v" : "\u{1D463}",
    "W" : "\u{1D44A}",
    "w" : "\u{1D464}",
    "X" : "\u{1D44B}",
    "x" : "\u{1D465}",
    "Y" : "\u{1D44C}",
    "y" : "\u{1D466}",
    "Z" : "\u{1D44D}",
    "z" : "\u{1D467}",
    "\u2710" : spacesChar.add,
    " " : " ",
    "\u000A" : "",
    "" : ""
};

// Dict used to convert characters that are not a command if the keyword !chem is used as the fist word of the text input
const lettersNoFont = {
    "+" : "\u002B",
    "-" : "\u2212",
    "=" : "\u003D",
    "'" : "\u2032",
    '"' : "\u2033",
    "/" : "/",
    "\\" : "\\",
    "," : ",",
    "." : ".",
    "°" : "°",
    "|" : "|",
    "!" : "!",
    "?" : "?",
    "&" : "&",
    "(" : "(",
    ")" : ")",
    "{" : "{",
    "}" : "}",
    "[" : "[",
    "]" : "]",
    "<" : "<",
    ">" : ">",
    "%" : "%",
    "*" : "*",
    "@" : "@",
    "#" : "#",
    "~" : "~",
    "¬" : "¬",
    ":" : ":",  // Same as "\colon", use "\ratio" instead to get the same as without "!chem"
    ";" : ";",
    "…" : "…",
    "0" : "0",
    "1" : "1",
    "2" : "2",
    "3" : "3",
    "4" : "4",
    "5" : "5",
    "6" : "6",
    "7" : "7",
    "8" : "8",
    "9" : "9", 
    "A" : "A",
    "a" : "a",
    "B" : "B",
    "b" : "b",
    "C" : "C",
    "c" : "c",
    "D" : "D",
    "d" : "d",
    "E" : "E",
    "e" : "e",
    "F" : "F",
    "f" : "f",
    "G" : "G",
    "g" : "g",
    "H" : "H",
    "h" : "h",
    "I" : "I",
    "i" : "i",
    "J" : "J",
    "j" : "j",
    "K" : "K",
    "k" : "k",
    "L" : "L",
    "l" : "l",
    "M" : "M",
    "m" : "m",
    "N" : "N",
    "n" : "n",
    "O" : "O",
    "o" : "o",
    "P" : "P",
    "p" : "p",
    "Q" : "Q",
    "q" : "q",
    "R" : "R",
    "r" : "r",
    "S" : "S",
    "s" : "s",
    "T" : "T",
    "t" : "t",
    "U" : "U",
    "u" : "u",
    "V" : "V",
    "v" : "v",
    "W" : "W",
    "w" : "w",
    "X" : "X",
    "x" : "x",
    "Y" : "Y",
    "y" : "y",
    "Z" : "Z",
    "z" : "z",
    "\u2710" : " ",
    " " : " ",
    "\u000A" : "",
    "" : ""
};

const lettersOutMathMode = {
    "+" : "+",
    "-" : "-",
    "=" : "=",
    "'" : "'",
    '"' : '"',
    "/" : "/",
    "\\" : "\\",
    "," : ",",
    "." : ".",
    "°" : "°",
    "|" : "|",
    "!" : "!",
    "?" : "?",
    "&" : "&",
    "(" : "(",
    ")" : ")",
    "{" : "{",
    "}" : "}",
    "[" : "[",
    "]" : "]",
    "<" : "<",
    ">" : ">",
    "%" : "%",
    "*" : "*",
    "^" : "^",
    "_" : "_",
    "@" : "@",
    "#" : "#",
    "~" : "~",
    "¬" : "¬",
    ":" : ":",
    ";" : ";",
    "…" : "…",
    "0" : "0",
    "1" : "1",
    "2" : "2",
    "3" : "3",
    "4" : "4",
    "5" : "5",
    "6" : "6",
    "7" : "7",
    "8" : "8",
    "9" : "9", 
    "A" : "A",
    "a" : "a",
    "B" : "B",
    "b" : "b",
    "C" : "C",
    "c" : "c",
    "D" : "D",
    "d" : "d",
    "E" : "E",
    "e" : "e",
    "F" : "F",
    "f" : "f",
    "G" : "G",
    "g" : "g",
    "H" : "H",
    "h" : "h",
    "I" : "I",
    "i" : "i",
    "J" : "J",
    "j" : "j",
    "K" : "K",
    "k" : "k",
    "L" : "L",
    "l" : "l",
    "M" : "M",
    "m" : "m",
    "N" : "N",
    "n" : "n",
    "O" : "O",
    "o" : "o",
    "P" : "P",
    "p" : "p",
    "Q" : "Q",
    "q" : "q",
    "R" : "R",
    "r" : "r",
    "S" : "S",
    "s" : "s",
    "T" : "T",
    "t" : "t",
    "U" : "U",
    "u" : "u",
    "V" : "V",
    "v" : "v",
    "W" : "W",
    "w" : "w",
    "X" : "X",
    "x" : "x",
    "Y" : "Y",
    "y" : "y",
    "Z" : "Z",
    "z" : "z",
    "\u2710" : " ",
    " " : " ",
    "\u000A" : "",
    "" : ""
};

const accents = {
    "\u0300" : "\u0300",
    "\u0301" : "\u0301",
    "\u0302" : "\u0302",
    "\u0303" : "\u0303",
    "\u0304" : "\u0304",
    "\u0305" : "\u0305",
    "\u0306" : "\u0306",
    "\u0307" : "\u0307",
    "\u0308" : "\u0308",
    "\u0309" : "\u0309",
    "\u030A" : "\u030A",
    "\u030B" : "\u030B",
    "\u030C" : "\u030C",
    "\u030D" : "\u030D",
    "\u030E" : "\u030E",
    "\u030F" : "\u030F",
    "\u0310" : "\u0310",
    "\u0311" : "\u0311",
    "\u0312" : "\u0312",
    "\u0313" : "\u0313",
    "\u0314" : "\u0314",
    "\u0315" : "\u0315",
    "\u0316" : "\u0316",
    "\u0317" : "\u0317",
    "\u0318" : "\u0318",
    "\u0319" : "\u0319",
    "\u031A" : "\u031A",
    "\u031B" : "\u031B",
    "\u031C" : "\u031C",
    "\u031D" : "\u031D",
    "\u031E" : "\u031E",
    "\u031F" : "\u031F",
    "\u0320" : "\u0320",
    "\u0321" : "\u0321",
    "\u0322" : "\u0322",
    "\u0323" : "\u0323",
    "\u0324" : "\u0324",
    "\u0325" : "\u0325",
    "\u0326" : "\u0326",
    "\u0327" : "\u0327",
    "\u0328" : "\u0328",
    "\u0329" : "\u0329",
    "\u032A" : "\u032A",
    "\u032B" : "\u032B",
    "\u032C" : "\u032C",
    "\u032D" : "\u032D",
    "\u032E" : "\u032E",
    "\u032F" : "\u032F",
    "\u0330" : "\u0330",
    "\u0331" : "\u0331",
    "\u0332" : "\u0332",
    "\u0333" : "\u0333",
    "\u0334" : "\u0334",
    "\u0335" : "\u0335",
    "\u0336" : "\u0336",
    "\u0337" : "\u0337",
    "\u0338" : "\u0338",
    "\u0339" : "\u0339",
    "\u033A" : "\u033A",
    "\u033B" : "\u033B",
    "\u033C" : "\u033C",
    "\u033D" : "\u033D",
    "\u033E" : "\u033E",
    "\u033F" : "\u033F",
    "\u0340" : "\u0340",
    "\u0341" : "\u0341",
    "\u0342" : "\u0342",
    "\u0343" : "\u0343",
    "\u0344" : "\u0344",
    "\u0345" : "\u0345",
    "\u0346" : "\u0346",
    "\u0347" : "\u0347",
    "\u0348" : "\u0348",
    "\u0349" : "\u0349",
    "\u034A" : "\u034A",
    "\u034B" : "\u034B",
    "\u034C" : "\u034C",
    "\u034D" : "\u034D",
    "\u034E" : "\u034E"
};

// Every dictionary, for the tests and for anything that needs to list the commands
// MatTalX knows (e.g. a symbol table on the website)
export const dictionaries = {
    mathDictionary, stdGreek, noStyleGreek, Superscript, Subscript,
    Above, Below, accents, textCommands, lettersMath, lettersNoFont, lettersOutMathMode
};

// This object contains the functions to create or modify commands
const settingsFunctions = {
    "\\newcommand" : newCommand,
    "\\renewcommand" : renewCommand,
    "\\DeclareMathOperator" : declareMathOperator,
    "\\DeclareUnicodeCharacter" : declareUnicodeCharacter
};

/** Convert text **/


// Main functions

function tokenize(fullTextString, mathmode) {
    // Everything MatTalX writes is outside the basic plane, so a symbol like '𝛼' takes two
    // places in a string. Walking characters rather than those halves is what lets an
    // already converted text be converted again without being cut in two.
    const fullText = Array.from(fullTextString);
    // This function takes the text as entered by the user, and outputs a list of tokens
    // For instance "curl written as $\nabla \times \mathbf{F}$" will output
    //  [c,u,r,l, ,w,r,i,t,t,e,n, ,a,s, ,STARTMM,\nabla, ,\times, ,\mathbf,STARTARG,F,ENDARG,ENDMM]
    const brackets = ["[", "]"];
    const parentheses = ["(", ")"];
    const commandStoppers = [" ", "\u000A", ",", "/", "-", "+", "<", ">", "|", "?", "(", ")"]; 
    // N.B. Brackets also stops commands (most of the time)
    const potentialCommandStoppers = [":" , ";" , "~", ".", "!", "'", '"', "=", "%", "#"];
    const startMathmode = mathmode;
    let outTokens = [];
    let temporaryBox = [];      // Stores characters that are in command (e.g. \int -> ['\', 'i', 'n', 't'])
    let trigger = false;        // true if a command has begun (e.g. input: '\' -> true)
    let mathmodeStarter = "";   // e.g. if mathmode is started with $$, then "$$" will be mathmodeStarter
    let char, i;

    if (startMathmode) {
        outTokens.push(specialTokens.startMathmode);
    };

    for (i=0; i<fullText.length; i++) {
        if (trigger) {
            if ((parentheses.includes(fullText[i])) && (fullText[i-1] === "\\")) {
                // '\(' and '\)' enter and leave math mode, like '$'
                // Unlike '\[' and '\]', they don't skip a line
                if (mathmode) {
                    if ((fullText[i] === ")") && (mathmodeStarter === "\\(")) {
                        mathmode = false;
                        mathmodeStarter = "";
                        outTokens.push(specialTokens.endMathmode);
                    } else {
                        outTokens.push(temporaryBox.join("") + fullText[i]);
                    };
                } else {
                    if (fullText[i] === "(") {
                        mathmode = true;
                        mathmodeStarter = "\\(";
                        outTokens.push(specialTokens.startMathmode);
                    } else {
                        outTokens.push(temporaryBox.join("") + fullText[i]);
                    };
                };
                trigger = false;
                temporaryBox = [];
            } else if (commandStoppers.includes(fullText[i])) {
                outTokens.push(temporaryBox.join(""));
                outTokens.push(fullText[i]);
                trigger = false;
                temporaryBox = [];
            } else if (potentialCommandStoppers.includes(fullText[i])) {
                if (fullText[i-1] === "\\") {
                    temporaryBox.push(fullText[i]);
                } else {
                    outTokens.push(temporaryBox.join(""));
                    outTokens.push(fullText[i]);
                    trigger = false;
                    temporaryBox = [];
                };
            } else if (brackets.includes(fullText[i])) {
                if (fullText[i-1] === "\\") {
                    if (mathmode) {
                        if ((fullText[i] === "]") && (mathmodeStarter === "\\[")) {
                            mathmode = false;
                            mathmodeStarter = "";
                            outTokens.push("\\\\");
                            outTokens.push(specialTokens.endMathmode);
                        } else {
                            outTokens.push(temporaryBox.join("") + fullText[i]);
                        };
                    } else {
                        if (fullText[i] === "[") {
                            mathmode = true;
                            mathmodeStarter = "\\[";
                            outTokens.push("\\\\");
                            outTokens.push(specialTokens.startMathmode);
                        } else {
                            outTokens.push(temporaryBox.join("") + fullText[i]);
                        };
                    };
                    trigger = false;
                    temporaryBox = [];
                } else {
                    if (temporaryBox.slice(0,5).join("") === "\\sqrt") {
                        temporaryBox.push(fullText[i]);
                    } else {
                        outTokens.push(temporaryBox.join(""));
                        outTokens.push(fullText[i]);
                        trigger = false;
                        temporaryBox = [];
                    };
                };
            } else if (fullText[i] === "{") {
                if (fullText[i-1] === "\\") {
                    outTokens.push(temporaryBox.join("") + fullText[i]);
                } else {
                    outTokens.push(temporaryBox.join(""));
                    outTokens.push(specialTokens.startArgument);
                };
                trigger = false;
                temporaryBox = [];
            } else if (fullText[i] === "}") {
                if (fullText[i-1] === "\\") {
                    outTokens.push(temporaryBox.join("") + fullText[i]);
                } else {
                    outTokens.push(temporaryBox.join(""));
                    outTokens.push(specialTokens.endArgument);
                };
                trigger = false;
                temporaryBox = [];
            } else if (fullText[i] === "$") {
                if (fullText[i-1] === "\\") {
                    outTokens.push(temporaryBox.join("") + fullText[i]);
                } else {
                    if (mathmode) {
                        if (mathmodeStarter === "$") {
                            if (fullText[i-1] === "$") {
                                mathmodeStarter = "$$";
                                outTokens.push("\\\\");
                            } else {
                                mathmode = false;
                                mathmodeStarter = "";
                                outTokens.push(temporaryBox.join(""));
                                outTokens.push(specialTokens.endMathmode);
                            };
                        } else if ((fullText[i-1] === "$") && (mathmodeStarter === "$$")) {
                            mathmode = false;
                            mathmodeStarter = "";
                            outTokens.push("\\\\");
                            outTokens.push(specialTokens.endMathmode);
                        } else if (fullText[i+1] === "$") {
                            outTokens.push(temporaryBox.join(""));
                            continue;
                        } else {
                            outTokens.push(temporaryBox.join(""));
                            outTokens.push(fullText[i]);
                        };
                    } else {
                        mathmode = true;
                        mathmodeStarter = "$";
                        outTokens.push(temporaryBox.join(""));
                        outTokens.push(specialTokens.startMathmode);
                    };
                };
                trigger = false;
                temporaryBox = [];
            } else if (fullText[i] === "\\") {
                if (fullText[i-1] === "\\") {
                    outTokens.push(temporaryBox.join("") + fullText[i]);
                    trigger = false;
                    temporaryBox = [];
                } else {
                    outTokens.push(temporaryBox.join(""));
                    temporaryBox = [fullText[i]];
                };
            } else if ((fullText[i] === "^") || (fullText[i] === "_")) {
                if (fullText[i-1] === "\\") {
                    if (mathmode) {
                        outTokens.push(temporaryBox.join("") + fullText[i]);
                        trigger = false;
                        temporaryBox = [];
                    } else {
                        temporaryBox.push(fullText[i]);
                    };
                } else {
                    outTokens.push(temporaryBox.join(""));
                    temporaryBox = [fullText[i]];
                };
            } else {
                temporaryBox.push(fullText[i]);
            };
        } else {
            if (fullText[i] === "\\") {
                trigger = true;
                temporaryBox.push(fullText[i]);
            } else if ((fullText[i] === "^") || (fullText[i] === "_")) {
                if (mathmode) {
                    trigger = true;
                    temporaryBox.push(fullText[i]);
                } else {
                    outTokens.push(fullText[i]);
                };
            } else if (fullText[i] === "$") {
                if (mathmode) {
                    if (mathmodeStarter === "$") {
                        if (fullText[i-1] === "$") {
                            mathmodeStarter = "$$";
                            outTokens.push("\\\\");
                        } else if (fullText[i+1] === "$") {
                            continue;
                        } else {
                            mathmode = false;
                            mathmodeStarter = "";
                            outTokens.push(specialTokens.endMathmode);
                        };
                    } else if (mathmodeStarter === "$$") {
                        if (fullText[i-1] === "$") {
                            mathmode = false;
                            mathmodeStarter = "";
                            outTokens.push("\\\\");
                            outTokens.push(specialTokens.endMathmode);
                        };
                    } else {
                        outTokens.push(fullText[i]);
                    };
                } else {
                    mathmode = true;
                    mathmodeStarter = "$";
                    outTokens.push(specialTokens.startMathmode);
                };
            } else if (fullText[i] === "}") {
                outTokens.push(specialTokens.endArgument);
            } else if (fullText[i] === "{") {
                outTokens.push(specialTokens.startArgument);
            } else {
                char = Array.from(fullText[i].normalize("NFD"));
                outTokens.push(...char);
            };
        };
    };

    if (startMathmode) {
        outTokens.push(specialTokens.endMathmode);
    };
    return outTokens;
};

function tokensToText(tokens, dictMM, dictOut, adjustSpacing, callSpaceCommand=true) {
    // Takes a list of tokens as input and uses the dictonary to convert them to symbols

    // What is written without curly brackets is filled in first, which needs the dictionaries
    // to know what takes an argument
    tokens = expandBracelessArgs(tokens, dictMM, dictOut);
    
    // The basic idea of the algorithm is:
    // Loop on tokens
    //     If token is STARTARG
    //         push to argStack
    //     If token is ENDARG
    //         pop from fctStack and argStack
    //         add the corresponding symbol to outText or mathmodeText
    //     Else
    //         push token to outText, mathmodeText, fctStack or the last index of argStack depending on token

    // E.g. If the input is: \f0{args0\f1{args1}}
    // Then at first, fctStack = [f0, f1] and argStack = [[args0], [args1]]
    // and then fctStack = [f0] and argStack = [[args0\f1{args1}]].

    let command;                 // Used to check if a command is a function or a symbol
    let fct;
    let fctStack = [];           // Stores the functions until they are used
    let callingFct;              // Might be different from fct (e.g. \\sqrt[3] is called with \\sqrt)
    let arg = [];
    let argStack = [];           // Stores the function arguments until they are used
    let outText = "";            // The text that will be returned
    let mathmodeText = "";       // Intermediary string that holds the text inside mathmode until the spaces are ajusted
    let mathmode = false;        // true if in mathmode, false if not
    let dict;                    // dictMM (mathmode) or dictOut (out of mathmode) depending if in mathmode or not
    let mathmodeOccurence = 0;   // Counts the number of times one enters and leaves mathmode
    let argDepth = 0;            // Add +1 if startArgument and -1 if endArgument
    let currentArgCount = [];    // Number of arguments per function
    let argNum;                  // Stores the number of arguments for the current function
    let i, j;

    for (i=0; i<tokens.length; i++) {
        dict = (mathmode) ? dictMM : dictOut;
        if (Object.values(specialTokens).includes(tokens[i])) {
            if (tokens[i] === specialTokens.startArgument) {
                argStack.push([]);
                ++argDepth;
                if (tokens[i-1] !== specialTokens.endArgument) {
                    currentArgCount.push(1);
                };
            } else if (tokens[i] === specialTokens.endArgument) {
                --argDepth;
                if (tokens[i+1] === specialTokens.startArgument) {
                    ++currentArgCount[currentArgCount.length-1];
                } else {
                    if (fctStack.length > 0) {
                        if (fctStack.length < currentArgCount.length) {
                            fct = "\\mathord";
                        } else {
                            fct = fctStack.pop();
                        };
                        if (argStack.length > 0) {
                            argNum = currentArgCount.pop();
                            for (j=0; j<argNum; j++) {
                                arg.unshift(argStack.pop());
                            };
                            if (fct.substring(0,5) === "\\sqrt") {
                                callingFct = fct.replace(/\[.*\]/g, "")
                            } else {
                                callingFct = fct;
                            };
                            // An unknown command keeps its argument, e.g. '\oingt{\alpha}' -> '\oingt{𝛼}'
                            const converted = (typeof dict[callingFct] === "function") ?
                                dict[callingFct](arg, fct) :
                                [failure(fct + arg.map((a) => "{" + stripFailures(a.join("")) + "}").join(""))];
                            if (argStack.length > 0) {
                                argStack[argStack.length-1].push(...converted);
                                if (typeof dict[callingFct] !== "function") {
                                    mistakes(fct, undefined);
                                };
                            } else {
                                if (mathmode) {
                                    mathmodeText += str(converted.join(""));
                                } else {
                                    outText += str(converted.join(""));
                                };
                                mistakes(fct, dict[callingFct]);
                            };
                        } else {
                            if (mathmode) {
                                mathmodeText += mistakes(fct+"{}", undefined, "Can't find an argument", fct);
                            } else {
                                outText += mistakes("Out of math mode", undefined, "Can't find an argument for " + fct + "{}", fct);
                            };
                        };
                        arg = [];
                    } else {
                        currentArgCount = [];
                        while (argStack.length > 0) {
                            arg.unshift(argStack.pop());
                        };
                        if (mathmode) {
                            mathmodeText += str(mathord(arg, "").join(""));
                            mistakes("{"+argsText(arg)+"}", mathord(arg, "").join(""), argsText(arg));
                        } else {
                            outText += mistakes("Out of math mode", undefined, "Can't find a function for {" + argsText(arg) + "}" + ". Use '\\{' or '\\}' to output a curly bracket", "{" + argsText(arg) + "}");
                        };
                        arg = [];
                    };
                };
            } else if (tokens[i] === specialTokens.startMathmode) {
                ++mathmodeOccurence;
                mathmode = true;
            } else if (tokens[i] === specialTokens.endMathmode) {
                ++mathmodeOccurence;
                mathmode = false;
                outText += adjustSpacing(mathmodeText);
                mathmodeText = "";
            };
        } else {
            if (tokens[i].substring(0,5) === "\\sqrt") {
                command = dict[tokens[i].replace(/\[.*\]/g, "")];
            } else {
                command = dict[tokens[i]];
            };
            if (typeof command == "function") {
                if (tokens[i+1] === specialTokens.startArgument) {
                    fctStack.push(tokens[i]);
                } else {
                    if (mathmode) {
                        if (command === sqrt) {
                            if (argStack.length > 0) {
                                argStack[argStack.length-1].push(...sqrt([], tokens[i]));
                            } else {
                                if (mathmode) {
                                    mathmodeText += str(sqrt([], tokens[i]).join(""));
                                    mistakes(tokens[i], sqrt([], tokens[i]).join(""));
                                } else {
                                    outText += str(sqrt([], tokens[i]).join(""));
                                    mistakes("Out of math mode", sqrt([], tokens[i]), tokens[i]);
                                };
                            };
                        } else {
                            mathmodeText += mistakes(tokens[i]+"{}", undefined, "Can't find an argument", tokens[i]);
                        };
                    } else {
                        outText += mistakes("Out of math mode", undefined, "Can't find an argument for "+tokens[i]+"{}", tokens[i]);
                    };
                };
            } else if ((command === undefined) && (tokens[i+1] === specialTokens.startArgument)) {
                // An unknown command that is given an argument, e.g. '\oingt{\alpha}'
                // Kept on the stack like a real function, so the output can show '\oingt{𝛼}'
                fctStack.push(tokens[i]);
            } else {
                if (argStack.length > 0) {
                    argStack[argStack.length-1].push(str(dict[tokens[i]], tokens[i]));
                    mistakes(tokens[i], dict[tokens[i]]);
                } else {
                    if (mathmode) {
                        mathmodeText += str(dict[tokens[i]], tokens[i]);
                        mistakes(tokens[i], dict[tokens[i]]);
                    } else {
                        outText += str(dict[tokens[i]], tokens[i]);
                        if (tokens[i][0] === "\\") {
                            // Out of math mode a character is just text, and text that is
                            // already converted shouldn't look like a mistake. A command
                            // that didn't convert is still worth saying out loud
                            mistakes("Out of math mode", dict[tokens[i]], tokens[i]);
                        };
                    };
                };
            };
        };
    };
    if (mathmode) {
        // Math mode was left open, so the text is converted as if it had been closed at the end
        // rather than being dropped with the rest of mathmodeText
        outText += adjustSpacing(mathmodeText);
        mathmodeText = "";
    };
    if (mathmodeOccurence % 2 !== 0) {
        mistakes("Math mode was not closed", undefined);
    };
    if (argDepth > 0) {
        mistakes("Unbalanced curly brackets ('{', '}')", undefined, "Too many '{'");
    } else if (argDepth < 0) {
        mistakes("Unbalanced curly brackets ('{', '}')", undefined, "Too many '}'");
    };
    return (callSpaceCommand) ? spaceCommand(outText) : outText;
};


// Used by main functions

function isCommand(token, mathmode) {
    // Says if a token is a command, so that what follows it can be its argument
    if ((token === undefined) || (Object.values(specialTokens).includes(token))) {
        return false;
    } else if ((token[0] === "^") || (token[0] === "_")) {
        // Out of math mode they are not superscript and subscript, just characters
        return mathmode;
    };
    return (token[0] === "\\") && (token.length > 1);
};

function takesArgument(token, dict) {
    // Says if a command is one the dictionary knows how to give an argument to
    // A command it doesn't know keeps whatever is between its curly brackets, but is not
    // given an argument it wasn't written with
    // '\sqrt[3]' is called with '\sqrt', the same way tokensToText looks it up
    const name = (token.substring(0,5) === "\\sqrt") ? token.replace(/\[.*\]/g, "") : token;
    return (typeof dict[name] === "function");
};

function bracelessArg(token) {
    // Says if a token can be the argument of a command written without curly brackets
    // (e.g. the '2' in 'x^2')
    if ((token === undefined) || (Object.values(specialTokens).includes(token))) {
        return false;
    } else if ((notBracelessArg.includes(token)) || (token[0] === "^") || (token[0] === "_")) {
        return false;
    } else if (token[0] === "\\") {
        return token.length > 1;  // A command (e.g. '\alpha'), but not a lone backslash
    } else {
        return Array.from(token).length === 1;
    };
};

function expandBracelessArgs(tokens, dictMM, dictOut) {
    // As in LaTeX, a command written without curly brackets takes the first thing that
    // follows it as its argument, and only that: 'x^2' is a shorthand for 'x^{2}', '\mathbf x'
    // for '\mathbf{x}', and '\sqrt x + y' for '\sqrt{x} + y'
    // The spaces in between mean nothing either, so '\mathbf {x}' is '\mathbf{x}' too
    // tokenize leaves '^' and '_' in two shapes: merged (e.g. '^2n') or alone, followed by a command
    let newTokens = [];
    let mathmode = false;
    let dict, chars, next, i, j;
    for (i=0; i<tokens.length; i++) {
        if (tokens[i] === specialTokens.startMathmode) {
            mathmode = true;
        } else if (tokens[i] === specialTokens.endMathmode) {
            mathmode = false;
        };
        dict = (mathmode) ? dictMM : dictOut;

        if (!isCommand(tokens[i], mathmode)) {
            newTokens.push(tokens[i]);
            continue;
        };
        if ((tokens[i].length > 1) && ((tokens[i][0] === "^") || (tokens[i][0] === "_"))) {
            // Merged by tokenize (e.g. '^2n'), so the first character is the argument and the rest follows
            chars = Array.from(tokens[i].substring(1));
            newTokens.push(tokens[i][0], specialTokens.startArgument, chars[0], specialTokens.endArgument);
            for (j=1; j<chars.length; j++) {
                newTokens.push(...Array.from(chars[j].normalize("NFD")));
            };
            continue;
        };

        // The argument is whatever comes next, however many spaces the user left in between
        j = i + 1;
        while (tokens[j] === " ") {
            ++j;
        };
        next = tokens[j];
        if (next === specialTokens.startArgument) {
            newTokens.push(tokens[i]);
            i = j - 1;  // Drops the spaces, the curly brackets already say what the argument is
        } else if ((takesArgument(tokens[i], dict)) && (bracelessArg(next))) {
            newTokens.push(tokens[i], specialTokens.startArgument, next, specialTokens.endArgument);
            i = j;  // Skips the spaces and the token that just became the argument
        } else {
            newTokens.push(tokens[i]);
        };
    };
    return newTokens;
};

function replaceLetters(letters, dict, initialCommand, checkMistakes=true) {
    // Used by a lot of functions to convert every letter in a string of characters
    dict = {...dict, ...accents};
    let newtext = [];
    for (let c in letters) {
        newtext.push(addSymbol(dict[letters[c]], false, letters[c]));
        if (checkMistakes) {
            mistakes(initialCommand + "{" + letters.join("") + "}", dict[letters[c]], (!isFailure(letters[c])) ? letters[c] : "A symbol does not exist or can't be shown");
        };
    };
    if (hasFailure(newtext)) {
        // Something in the argument couldn't be converted, so the command is kept whole
        // in the output (e.g. '\mathbf{\oingt}' rather than just '\oingt')
        return [failure(initialCommand + "{" + stripFailures(letters.join("")) + "}")];
    };
    return newtext;
};

function combineSymbols(arg, initialCommand, symbol, forTwo=undefined) {
    // Appends a 'combining symbol' to a regular symbol to create a new one (e.g. 'e' + '´' -> é)
    let textComb = [];
    let combArg = arg[0];
    if ((combArg.length === 2) && (forTwo !== undefined)) {
        textComb.push(str(combArg[0]) + forTwo + str(combArg[1]));
        mistakes(initialCommand + "{" + errSymbol + str(combArg[1]) + "}", combArg[0], "Argument doesn't exist");
        mistakes(initialCommand + "{" + str(combArg[0]) + errSymbol + "}", combArg[1], "Argument doesn't exist");
    } else {
        let err = [];
        for (let c in combArg) {
            if (combArg[c] !== undefined) {
                textComb.push(combArg[c] + symbol);
                err.push(combArg[c]);
            } else {
                textComb.push(failure(undefined));
                err.push(failure(undefined));
            };
        };
        if (hasFailure(err)) {
            mistakes(initialCommand + "{" + err.join("") + "}", undefined, "Argument doesn't exist");
        };
    };
    return textComb.concat(extraArgs(arg.slice(1), initialCommand));
};

function addSymbol(command, keepArray=false, original=undefined) {
    // Return the command if it's defined, if not it returns the text that couldn't be converted
    if ((typeof command == "object") && !(keepArray)) {
        // Changes an array of characters into a string
        command = command.join("");
    };
    return (command !== undefined) ? command : failure(original);
};

function addSymbolArray(args, command, checkMistakes=true) {
    // Differs from the function above as it takes in an array instead of a string
    let output = [];
    for (let i in args) {
        output.push((args[i] !== undefined) ? args[i] : failure(undefined));
        if (checkMistakes) {
            mistakes(command, (isFailure(args[i]) || (args[i] === undefined)) ? undefined : args[i], "A symbol does not exist or can't be shown");
        };
    };
    return output.join("");
};

function str(command, original=undefined) {
    // Make sure the command is a string, or keep the text that couldn't be converted
    return (typeof command === "string") ? command : failure(original);
};

function argsText(args) {
    // Every argument of a command, one after the other, as the user wrote them
    // 'args' holds one list of tokens per argument, so a plain join would leave a comma
    // between them (e.g. '{a,b,c}' for '{abc}')
    return args.map((a) => a.join("")).join("");
};

function extraArgs(args, initialCommand) {
    // If the user enters to many arguments in a function, the extras will be sent to this function
    // e.g. \mathbf{A}{B} will result in \mathbf{A}\mathord{B}
    return mathord(args, initialCommand);
};


//-----------------------------------------------------//

/** Check mistakes **/

function mistakes(textInput, textOutput, letter="", shown=undefined) {
    // Writes every errors in a box, so it's easier for the user to find them

    if (textOutput === undefined) {
        if (letter !== "") {
            if (!isFailure(letter)) {  // Only add to errorsList once
                if (letter.includes(spacesChar.add)) {
                    if (textInput.substring(0,5) === "\\text") {
                        errorsList += spaceCommand(textInput + " \u2192 Spaces are kept inside '" + textInput.replace(/{.*}/g, "") + "{}', no need for a spacing command") + "\r\n";
                    } else if ((textInput[0] === "^") || (textInput[0] === "_") || (textInput.substring(0,5) == "\\frac")) {
                        const initialSpaceCommand = ["\\:", "\\;", "\\quad", "\\qquad"];
                        errorsList += spaceCommand(textInput + " \u2192 Replace '" + initialSpaceCommand[letter.length-1] + "' by '\\hspace{" + letter.length + "}'") + "\r\n";
                    } else {
                        errorsList += spaceCommand(textInput + " \u2192 " + '"' + letter + '" \r\n');
                    };
                } else if ((textInput[0] === "^") || (textInput[0] === "_")) {
                    if (letter.indexOf("Can't find an argument") !== -1) {
                        const example = (textInput[0] === "^") ? "ⁿ" : "ₙ";
                        errorsList += "For '" + textInput[0] + "' alone: \\" + textInput[0] + " \u2192 " + textInput[0] + 
                        "  |  To use '" + textInput[0] + "' as a command: " + textInput[0] + "{n} \u2192 " + example + "\r\n";
                    } else {
                        errorsList += spaceCommand(textInput + " \u2192 " + '"' + letter + '" \r\n');
                    };
                } else {
                    errorsList += spaceCommand(textInput + " \u2192 " + '"' + letter + '" \r\n');
                };
            };
        } else {
            if ((textInput[0] === "^") || (textInput[0] === "_")) {
                if (textInput[1] === "{") {
                    errorsList += '"' + textInput + '" \u2192 ' + "Argument does not exists" + '\r\n';
                } else {
                    errorsList += '"' + textInput + '" \u2192 ' + "try: " + textInput[0] + "{" + textInput.slice(1) + "}" + '\r\n';
                };
            } else {
                errorsList += '"' + textInput + '" \r\n';
            };
        };
    };
    return [failure(shown)];
};

export function resetErrors() {
    // Empties the list of errors, so the interface can start a fresh one
    errorsList = "";
};

export function reportError(textInput, letter) {
    // For errors that don't come from a conversion (e.g. invalid settings)
    // Returns the list of errors, for the interface to display
    mistakes(textInput, undefined, letter);
    return errorsList;
};


//-----------------------------------------------------//

/** Matrix function **/

function matrix(text, initialCommand) {
    // Converts arrays into a matrix (i.e. \matrix{[a,b,c][1,2,3]} will be converted to the corresponding 2x3 matrix)
    text = text[0].join("")
                  .replace(/ /g, "");
    let matrixText = "";
    let i, x;
    let cpt = 0;
    let rceil = 0;
    let lceil = 0;
    let lfloor = 0;
    let rfloor = 0;

    for (x in text) {
        if (text[x] == "[" || text[x] == "]") {
            ++cpt;
        };
    };
    if (cpt == 2) {
        // vector (ie single line matrix)
        matrixText = text;
        matrixText = matrixText.replace(/\[/g, "["+spacesChar.add);
        matrixText = matrixText.replace(/\]/g, spacesChar.add+"]");
        matrixText = matrixText.replace(/,/g, spacesChar.add);
        return [matrixText];
    } else {
        matrixText += "\u000A";
        for (i in text) {
            if (text[i] == "[" && rceil == 0) {
                matrixText += "\u23A1"+spacesChar.add;
                ++rceil;
            } else if (text[i] == "]" && lceil == 0) {
                matrixText += spacesChar.add+"\u23A4\u000A";
                ++lceil;
            } else if (text[i] == "]") {
                matrixText += spacesChar.add+"\u23A5\u000A";
            } else if (text[i] == "[") {
                matrixText += "\u23A2"+spacesChar.add;
            } else {
                matrixText += text[i];
            };
        };
        for (let n = matrixText.length; n > 0; n--) {
            if (matrixText[n] == "\u23A5" && n > rfloor) {
                matrixText = matrixText.split("");
                matrixText[n] = "\u23A6";
                matrixText[n+1] = "";  // removes "\u000A" since it's the last line
                matrixText = matrixText.join("");
                rfloor = n;
            } else if (matrixText[n] == "\u23A2" && n > lfloor) {
                matrixText = matrixText.split("");
                matrixText[n] = "\u23A3";
                matrixText = matrixText.join("");
                lfloor = n;
            };
        };
    };
    matrixText = matrixCols(matrixText);  // Adjusts columns width
    matrixText = matrixText.replace(/,/g, spacesChar.add);  // Add spaces between characters
    matrixText += "\u000A";
    if ((cpt % 2 != 0) || (cpt == 0)) {
        matrixText = failure(initialCommand + "{" + text + "}");
        mistakes('Wrong arguments given" \r\n  Example: "\\matrix{[a,b,c][d,e,f][1,2,3]}', undefined);
    } else if (settings.mathFont) {
        mistakes(initialCommand+"{}", undefined, "Works better with 'Mathematical font' unchecked");
    };
    return [matrixText];
};

function matrixCols(matrix) {
    // Adjusts columns length for \matrix command
    // So, if the input is [100,10,1][0,0,0], the output should still be a 2x3 matrix with the elements aligned
    let positionLength = 0;
    let posLengths = [];
    let matrixPositions = [];
    let matrixPos = 0;
    let realPositions = [];
    for (let i in matrix) {
        if (matrix[i] == ",") {
            matrixPositions.push(matrixPos);
            ++matrixPos;
            posLengths.push(positionLength);
            positionLength = 0;
            realPositions.push(i-1);
        } else if ((matrix[i] == "\u23A4") || (matrix[i] == "\u23A5") || (matrix[i] == "\u23A6")) {  // right bracket
            matrixPositions.push(matrixPos);
            matrixPos = 0;
            posLengths.push(positionLength);
            positionLength = 0;
            realPositions.push(i-2);
        } else if ((matrix[i] == "\u23A1") || (matrix[i] == "\u23A2") || (matrix[i] == "\u23A3") || (matrix[i] == " ") || (matrix[i] == "\u000A")) {  // left bracket and spaces
            continue;
        } else {
            ++positionLength;
        };
    };
    // Add spaces to adjust columns length
    let spacesAdded = 1;
    for (let i in posLengths) {
        for (let n in matrixPositions) {
            if (matrixPositions[i] == matrixPositions[n]) {
                matrix = matrix.split("");
                while (posLengths[i] < posLengths[n]) {
                    matrix.splice(realPositions[i] + spacesAdded, 0, spacesChar.add);
                    ++posLengths[i];
                    ++spacesAdded;
                };
                matrix = matrix.join("");
            };
        };
    };
    return matrix;
};


//-----------------------------------------------------//

/** Automatic spacing **/

export function spaceCommand(text) {
    // Add spaces ("\:" command)
    // Internally, spaces that are kept even if 'Adjust spaces' is on are represented as \u2710
    // this function changes them back to spaces
    let sp = new RegExp(spacesChar.add, "g");
    let sr = new RegExp(spacesChar.remove, "g");
    let srr = new RegExp(spacesChar.remove+" ", "g");
    let srl = new RegExp(" "+spacesChar.remove, "g");
    text = text.replace(sp, " ")

    // Also, it removes a space around the command \! (and the command itself)
            .replace(srr, "")
            .replace(srl, "")
            .replace(sr, "");
    return text;
};

function adjustSpacesCommon(input, symbolSpaced, conditionalSpaces) {
    // Removes spaces and add some depending on surrounding symbols
    // Used if 'Adjust space' is on
    // TODO: Linebreaks should be like in LaTeX, i.e. a single "enter" does nothing but two adds a linebreak.
    /* 
        TODO: Spacing around symbols like '+' should depend of context
        For instance f(y+2) should return f(y+2), but 3x²+4y should return 3x² + 4y 
        Also, a_{i}-x should return a_{i} - x, but \sum_{i}-x should return \sum_{i}-x (as in \sum_{i}(-x) or -\sum_{i}x)
        Again, it should take the context in consideration
    */

    if ((settings.adjustSpaces == true) && (input.length > 2)) {
        const noSpaceSymbols = Object.values(Subscript).concat(Object.values(Above), Object.values(Below)).filter(x => {return x !== spacesChar.add;});
        // noSpaceSymbols is a list of all the symbols (subscript and combined symbol, without spaces) that delay a space to be added.
        // For instance, the spaces in 'x \equiv_{2} 0 \def x \equiv 0 (mod 2)' should be kept the same and therefore 'delay' the space
        // to be added from \equiv because of the subscript.
        const spacedChar = characters.concat(noSpaceSymbols, Object.values(Superscript));  // Add space around 'conditionalSpaces' if the previous symbol is in spacedChar
        // Characters, not UTF-16 halves, so a symbol is never read as two things.
        // The marks around what couldn't be converted go first: every command has run by
        // now, and leaving them in would hide the character the spacing rules look at
        const chars = Array.from(stripFailures(input).replace(/ /g, ""));
        let output = "";
        let previous = undefined;   // Last character written, kept rather than read back out
        const write = (text) => {
            output += text;
            const written = Array.from(text);
            if (written.length > 0) {
                previous = written[written.length - 1];
            };
        };
        let delayedSpace = false;
        let spaceStored = [];
        for (let i=0; i<chars.length; i++) {
            delayedSpace = noSpaceSymbols.includes(chars[i+1]);
            if (symbolSpaced.includes(chars[i])) {
                if ((previous !== " ") && (previous !== undefined)) {
                    if (delayedSpace) {
                        write(" " + chars[i]);
                        spaceStored.push(" ");
                    } else {
                        write(" " + chars[i] + " ");
                    }
                } else {
                    if (delayedSpace) {
                        write(chars[i]);
                        spaceStored.push(" ");
                    } else {
                        write(chars[i] + " ");
                    };
                };
            } else if (conditionalSpaces.includes(chars[i])) {
                if ((previous !== " ") && (previous !== undefined) && (spacedChar.includes(previous))) {
                    if (delayedSpace) {
                        write(" " + chars[i]);
                    } else {
                        write(" " + chars[i] + " ");
                    };
                } else {
                    write(chars[i]);
                };
            } else {
                if (delayedSpace) {
                    write(chars[i]);
                } else {
                    if (spaceStored.length >= 1) {
                        write(chars[i] + " ");
                        spaceStored = [];
                    }
                    else {
                        write(chars[i]);
                    };
                };
            };
        };
        return spaceCommand(output);
    } else {
        return spaceCommand(stripFailures(input));
    };
};

function adjustSpaces(input) {
    // Calls adjustSpacesCommon with specific symbols where spaces around them should be added
    // TODO: Maybe they should all be conditionalSpaces?
    const symbolSpaced = ["\u003D", "\u003C", "\u003E", "\u21D2", "\u21D0", "\u21CD", "\u21CF", "\u21CE", "\u2192", "\u27F6", "\u2190", "\u27F5", 
                          "\u2194", "\u21AE", "\u219A", "\u219B", "\u27F8", "\u27F9", "\u27F9", "\u21D4", "\u27FA", "\u27FC", "\u21CC", "\u21CB", 
                          "\u21C0", "\u21C1", "\u21BC", "\u21BD", "\u219E", "\u21A0", "\u21C7", "\u21C9", "\u21F6", "\u21C6", "\u21C4", "\u21DA", 
                          "\u21DB", "\u21A2", "\u21A3", "\u21DC", "\u21DD", "\u21AD", "\u27FF", "\u21E0", "\u21E2", "\u2208", "\u2209", "\u220B",
                          "\u2282", "\u2284", "\u2286", "\u2288", "\u2283", "\u2285", "\u2287", "\u2289", "\u228F", "\u2290", "\u2291", "\u2292",
                          "\u22D0", "\u22D1", "\u2ABF", "\u2AC0", "\u27C3", "\u27C4", "\u2245", "\u2247", "\u221D", "\u2261", "\u2A67", "\u2263",
                          "\u2260", "\u226E", "\u226F", "\u2264", "\u2A7D", "\u2265", "\u2A7E", "\u2270", "\u2271", "\u2A87", "\u2268", "\u2A88",
                          "\u2269", "\u2A89", "\u2A8A", "\u22E6", "\u22E7", "\u226A", "\u22D8", "\u226B", "\u22D9", "\u227A", "\u227B", "\u2280",
                          "\u2281", "\u227C", "\u227D", "\u2AB5", "\u2AB6", "\u2AB9", "\u2ABA", "\u22E8", "\u22E9", "\u27C2", "\u2AEB", "\u2226",
                          "\u2AF4", "\u2AF5", "\u224D", "\u2227", "\u2228", "\u27CE", "\u27CF", "\u2971", "\u2972", "\u2974", "\u2250", "\u2A66",
                          "\u00D7", "\u22CA", "\u22C9", "\u225D", "\u2254", "\u2255", "\u2243", "\u2244"];
    const conditionalSpaces = ["\u002B", "\u2212", "\u00B1", "\u2213", "\u2248", "\u223C", "\u224C", "\u2241"];
    return adjustSpacesCommon(input, symbolSpaced, conditionalSpaces);
};

function adjustSpaceChem(input) {  // Deprecated
    // Calls adjustSpacesCommon with specific symbols where spaces around them should be added
    const symbolSpaced = ["\u21D2", "\u21D0", "\u21CD", "\u21CF", "\u21CE", "\u2192", "\u27F6", "\u2190", "\u27F5", "\u003C", "\u003E",
                          "\u2194", "\u21AE", "\u219A", "\u219B", "\u27F8", "\u27F9", "\u27F9", "\u21D4", "\u27FA", "\u27FC", "\u21CC", "\u21CB", 
                          "\u21C0", "\u21C1", "\u21BC", "\u21BD", "\u219E", "\u21A0", "\u21C7", "\u21C9", "\u21F6", "\u21C6", "\u21C4", "\u21DA", 
                          "\u21DB", "\u21A2", "\u21A3", "\u21DC", "\u21DD", "\u21AD", "\u27FF", "\u21E0", "\u21E2", "\u2208", "\u2209", "\u220B",
                          "\u2282", "\u2284", "\u2286", "\u2288", "\u2283", "\u2285", "\u2287", "\u2289", "\u228F", "\u2290", "\u2291", "\u2292",
                          "\u22D0", "\u22D1", "\u2ABF", "\u2AC0", "\u27C3", "\u27C4", "\u2245", "\u2247", "\u221D", "\u2A67", "\u2250", "\u2A66",
                          "\u2260", "\u226E", "\u226F", "\u2264", "\u2A7D", "\u2265", "\u2A7E", "\u2270", "\u2271", "\u2A87", "\u2268", "\u2A88",
                          "\u2269", "\u2A89", "\u2A8A", "\u22E6", "\u22E7", "\u226A", "\u22D8", "\u226B", "\u22D9", "\u227A", "\u227B", "\u2280",
                          "\u2281", "\u227C", "\u227D", "\u2AB5", "\u2AB6", "\u2AB9", "\u2ABA", "\u22E8", "\u22E9", "\u27C2", "\u2AEB", "\u2226", 
                          "\u2AF4", "\u2AF5", "\u224D", "\u2227", "\u2228", "\u27CE", "\u27CF", "\u2971", "\u2972", "\u2974", "\u00D7", "\u22CA",
                          "\u22C9", "\u225D", "\u2254", "\u2255"];
    const conditionalSpaces = ["\u002B", "\u00B1", "\u2213", "\u2248", "\u223C", "\u224C", "\u2241"];
    return adjustSpacesCommon(input, symbolSpaced, conditionalSpaces);
};


//-----------------------------------------------------//

/** Main **/

export function convert(fullText, userSettings) {
    // Takes text and convert it based on the documentclass (or package)
    // Returns the converted text and the errors found on the way, for the interface to display
    settings = {...defaultConversionSettings, ...userSettings};
    errorsList = "";
    const firstWord = fullText.split(" ")[0];
    let fullDict;
    if (firstWord === "!chem") {  // TODO: Should remove this option
        // Chemistry package, differs in the automatic conversion of letters and spacing adjustments
        fullDict = makeDict(firstWord);
        fullText = fullText.replace("!chem", "");
        fullText = tokensToText(tokenize(fullText, settings.mathMode), fullDict, dictOutMathmode, adjustSpaceChem);
    } else {
        // Default package
        fullDict = makeDict("default");
        fullText = tokensToText(tokenize(fullText, settings.mathMode), fullDict, dictOutMathmode, adjustSpaces);
    };
    // The marks were only there to tell the parser a conversion had failed
    return {text: stripFailures(fullText), errors: stripFailures(errorsList)};
};

// Nothing out of math mode depends on the settings, so it is built once
const dictOutMathmode = {...lettersOutMathMode, ...accents, ...textCommands};

// Building the dictionary in math mode is nearly all of the time a conversion takes, and it
// only depends on the settings, so the last one is kept and handed back when they are the same
// Nothing writes to it while converting, only while building it, which is what makes this safe
let builtDict = {key: null, dict: null, errors: ""};

function makeDict(documentClass) {
    // Returns the full dictionary (in mathmode) with all the commands, letters, etc. based on documentclass and font choice
    const key = documentClass + "\u0000" + settings.mathFont + "\u0000" +
                JSON.stringify(settings.customCommands);
    if (builtDict.key === key) {
        // What was said while building it has to be said again: a command the user got
        // wrong would otherwise be reported once and never again
        errorsList += builtDict.errors;
        return builtDict.dict;
    };
    const before = errorsList.length;
    const dict = buildDict(documentClass);
    builtDict = {key: key, dict: dict, errors: errorsList.substring(before)};
    return dict;
};

function buildDict(documentClass) {
    // Puts the dictionary together, which makeDict() only does when it has to
    const greek = (settings.mathFont) ? stdGreek : noStyleGreek;
    let letters;  // lettersMath or lettersNoFont
    if (documentClass === "!chem") {
        letters = lettersNoFont;  // Works better to "draw" molecules with lewis notation
    } else {  // documentClass === "default"
        letters = (settings.mathFont) ? lettersMath : lettersNoFont;
    };
    return buildAllCommands({...mathDictionary, ...oldNames, ...greek, ...letters, ...accents});
};

function buildAllCommands(fullDict) {
    // Includes every commands built by the user in the object containing every commands (in math mode)
    // Called by makeDict(), on the commands the interface put in settings.customCommands
    for (let i=0; i<settings.customCommands.length; i+=1) {
        const command = settings.customCommands[i];
        if ((command.type !== undefined) && 
            // (command.numArgs !== undefined) && 
            (command.newInput !== "") && 
            (command.output !== ""))
        {
            fullDict = settingsFunctions[command.type](
                            fullDict,
                            0, // command.numArgs,
                            command.newInput.replace(/ /g, ""), 
                            command.output+" "
                        );
        };
    };
    return fullDict;
};

export function buildCommandWithArgs(fullDict, argNums, input, output) {
    // Called by newCommand or renewCommand if argNums >= 1
    let tokens = tokenize(output, true);
    // Put argument number (of the form #i) as a single token
    for (let i=0; i<tokens.length; ++i) {
        if (tokens[i-1] === "#") {
            while (!isNaN(tokens[i])) {
                tokens[i-1] += tokens[i];
                tokens.splice(i,1);
            };
        };
    };
    // TODO: tokensToText does not accept special characters, but arg are already converted, so  
    // some tokens might be special characters (e.g. integral sign, alpha, etc.).
    const outputFunc = (arg, initialCommand) => {
        if (argNums > arg.length) {
            mistakes(input+"{}".repeat(arg.length), undefined, "Missing arguments: "+arg.length+" instead of "+argNums+".");
        };
        // Works on a copy, since outputFunc is called once per use of the command
        let liveTokens = [...tokens];
        for (let i=0; i<liveTokens.length; ++i) {
            if (liveTokens[i][0] === "#") {
                let num = parseInt(liveTokens[i].substring(1));
                if (num <= argNums) {
                    liveTokens.splice(i,1,...arg[num-1]);
                };
            };
        };
        return [tokensToText(liveTokens, fullDict, {}, (t) => {return t;}, false).concat(extraArgs(arg.slice(argNums), initialCommand))];
    };
    return outputFunc;
};

function newCommand(fullDict, argNums, input, output) {
    // Only add the command if its name is not already defined
    if (Object.hasOwn(fullDict, input)) {
        mistakes("Settings", undefined, input + " is already defined. Use '\\renewcommand' instead.");
    } else {
        let outNoSpace = output.replace(/ /g, "");
        let outputSymbol;
        if (argNums == 0) {
            if (typeof fullDict[outNoSpace] == "function") {
                outputSymbol = fullDict[outNoSpace];
            } else {
                outputSymbol = tokensToText(tokenize(output, true), fullDict, {}, (t) => {return t;}, false);
            };
        } else {
            outputSymbol = buildCommandWithArgs(fullDict, argNums, input, output);
        };
        fullDict[input] = outputSymbol;
    };
    return fullDict;
};

function renewCommand(fullDict, argNums, input, output) {
    // Overrides existing command if needed, if not it creates it (like newCommand)
    let outNoSpace = output.replace(/ /g, "");
    let outputSymbol;
    if (argNums == 0) {
        if (typeof fullDict[outNoSpace] == "function") {
            outputSymbol = fullDict[outNoSpace];
        } else {
            outputSymbol = tokensToText(tokenize(output, true), fullDict, {}, (t) => {return t;}, false);
        };
    } else {
        outputSymbol = buildCommandWithArgs(fullDict, argNums, input, output);
    };
    fullDict[input] = outputSymbol;
    return fullDict;
};

function declareMathOperator(fullDict, argNums, input, output) {
    // Adds a new operator
    if (argNums !== 0) {
        mistakes("Settings", undefined, "DeclareMathOperator must have 0 argument.");
    };
    let outputSymbol = tokensToText(tokenize(output, true), fullDict, {}, (t) => {return t;});
    // TODO: If text: \mathrm, else: nothing
    const newOp = (arg, initialCommand) => {
        // This function will be the value of every operator built by the user
        return [outputSymbol + "[" + argsText(arg) + "]"];
    };
    fullDict[input] = newOp;
    return fullDict;
};

function declareUnicodeCharacter(fullDict, argNums, input, output) {
    // Verifies if the output is a valid unicode character and if so, adds it as a command
    if (argNums !== 0) {
        mistakes("Settings", undefined, "DeclareUnicodeCharacter must have 0 argument.");
    };
    if (output.substring(0,2) === "\\u") {
        try {
            let outputSymbol = String.fromCodePoint(parseInt(output.substring(2).replace(/ /g, ""), 16));
            fullDict[input] = outputSymbol
            return fullDict;
        } catch(err) {
            mistakes("Settings", undefined, output + " is not a valid unicode character.");
            return fullDict;
        };
    } else {
        mistakes("Settings", undefined, output + " is not a valid unicode character. Must be of the form '\\uXXXX'.");
        return fullDict;
    };
};

