"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeMarkdownV2 = escapeMarkdownV2;
/**
 * Функция для экранирования специальных символов MarkdownV2, требуемых Telegram.
 */
function escapeMarkdownV2(text) {
    const escapeChars = [
        "_",
        "*",
        "[",
        "]",
        "(",
        ")",
        "~",
        "`",
        ">",
        "#",
        "+",
        "-",
        "=",
        "|",
        "{",
        "}",
        ".",
        "!",
    ];
    let escapedText = text;
    escapeChars.forEach((char) => {
        const regExp = new RegExp(`\\${char}`, "g");
        escapedText = escapedText.replace(regExp, `\\${char}`);
    });
    return escapedText;
}
