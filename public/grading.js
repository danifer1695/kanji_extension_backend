const {toHiragana, isJapanese} = require("../lib/wanakana.min.js");

function normalizeMeaning(s)
{
    return s.trim().toLowerCase().replace(/^to\s+/, '').replace(/\s+/g, ' ');
}

function checkReading(answer, acceptedReadings)
{
    const normalized = toHiragana(answer.trim(), {passRomaji: false});
    return acceptedReadings.some(r => toHiragana(r) === normalized);
}

function checkMeaning(answer, acceptedMeanings)
{
    const normalized = normalizeMeaning(answer);
    return acceptedMeanings.some(m => normalizeMeaning(m) === normalized);
}

module.exports = {checkMeaning, checkReading};
