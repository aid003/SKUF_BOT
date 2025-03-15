/**
 * Функция для экранирования специальных символов MarkdownV2, требуемых Telegram.
 */
export function escapeMarkdownV2(text: string): string {
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
