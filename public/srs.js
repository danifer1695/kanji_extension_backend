//Spaced Repetition System (SRS) logic.

//Leitner-style spacing intervals, in hours.
const INTERVALS = [4, 8, 24, 48, 168, 336, 720, 2160, 5040];
const MAX_LEVEL = INTERVALS.length - 1;

//Returns a new review state given the current state and whether the given 
//answer was correct or not
function applyReview(current, correct, now = new Date())
{
    //depending on whether the answer was correct or not, we either move up a level
    //or drop by however much we decide (in this case half)
    const level = correct
        ? Math.min(current.mastery_level + 1, MAX_LEVEL)   //make sure we dont go past the max
        : Math.max(Math.floor(current.mastery_level / 2), 0);   //Failing drops your level by half

    //new interval in miliseconds
    const intervalMs = INTERVALS[level] * 60 * 60 * 1000;

    //return JSON package
    return {
        mastery_level: level,
        times_correct: current.times_correct + (correct ? 1 : 0),
        times_incorrect: current.times_incorrect + (correct ? 0 : 1),
        last_reviewed: now,
        next_review: new Date(now.getTime() + intervalMs),
    };
}

module.exports = {applyReview, INTERVALS, MAX_LEVEL};
