const {toHiragana, isJapanese} = require("../lib/wanakana.min.js");

function normalizeMeaning(s)
{
    return s.trim().toLowerCase().replace(/^to\s+/, '').replace(/\s+/g, ' ');
}

function readingVariants(s)
{
    //kanjiapi separates okurigana with a dot, so we want to accept answers
    //with and without the okurigana. for that we need to trim the dot out
    const trimmed = s.trim();
    const beforeDot = trimmed.replace(/[.．・].*$/, "");   // kanji reading only
    const full      = trimmed.replace(/[.．・]/g, "");      // whole word
    return [...new Set([beforeDot, full])];
}

function checkReading(answer, acceptedReadings)
{
    const normalized = toHiragana(answer.trim(answer), {passRomaji: false});
    const accepted = acceptedReadings.flatMap(readingVariants);
    return accepted.some(r => toHiragana(r) === normalized);
}

function checkMeaning(answer, acceptedMeanings)
{
    const normalized = normalizeMeaning(answer);
    return acceptedMeanings.some(m => normalizeMeaning(m) === normalized);
}

module.exports = {checkMeaning, checkReading};
