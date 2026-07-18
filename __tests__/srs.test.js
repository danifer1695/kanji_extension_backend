const {applyReview, INTERVALS, MAX_LEVEL } = require("../public/srs");

//A fixed clock, so we can assert exact timestams
const NOW = new Date("2026-01-01T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;

//Build a card in whatever state we need for the test
function make_card(overrides = {})
{
    return {
        mastery_level: 0,
        times_correct: 0,
        times_incorrect: 0,
        last_reviewed: null,
        next_review: NOW,
        ...overrides,
    };
};

//Mastery level fluctuation--------------------------------------------------------------------
describe("applyReview - mastery level", () => {
    test("a correct answer promotes the card one level", () => {

        //pass in a fake card with a supposed correct answer.
        const res = applyReview(make_card({mastery_level:0}), true, NOW);

        //mastery level should have increased by one
        expect(res.mastery_level).toBe(1);
    });

    test("a wrong answer demotes the card by half", () => {

        //fake card
        const res = applyReview(make_card({mastery_level: 5}), false, NOW);

        //expect mastery to be halved, rounded down.
        expect(res.mastery_level).toBe(2);
    });

    test("a wrong answer at level 0 does not drop level below 0", () => {

        //fake card
        const res = applyReview(make_card({mastery_level: 0}), false, NOW);

        //mastery level should still be 0
        expect(res.mastery_level).toBe(0);
    });

    test("a correct answer at top level (8) clamps instead of increasing", () => {

        //fake card
        const res = applyReview(make_card({mastery_level: MAX_LEVEL}), true, NOW);

        //mastery level should remain at 8
        expect(res.mastery_level).toBe(MAX_LEVEL);
    })
});

//Scheduling-----------------------------------------------------------------------------------
describe("applyReview - scheduling", () => {
    test("promotion from level 0 --> 1 schedules the next review 8 hours out", () => {

        //fake card with a mastery level of 0
        const res = applyReview(make_card({mastery_level: 0}), true, NOW);

        //next review should be due in 8 hours.
        expect(res.next_review.getTime()).toBe(NOW.getTime() + 8 * HOUR);
    });

    test("demotion from level 4 --> 2 schedules the next review 24 hours out", () => {

        //fake card with a mastery level of 0
        const res = applyReview(make_card({mastery_level: 4}), false, NOW);

        //next review should be due in 8 hours.
        expect(res.next_review.getTime()).toBe(NOW.getTime() + 24 * HOUR);
    });

    test("every level maps to an interval, and the intervals only grow", () => {

        for(let i = 1; i < INTERVALS.length; i++)
        {
            expect(INTERVALS[i]).toBeGreaterThan(INTERVALS[i - 1]);
        }
    });

    test("last_reviewed is set to the supplied time", () => {

        const res = applyReview(make_card(), true, NOW);

        expect(res.last_reviewed).toBe(NOW);
    })

});

//Counters-------------------------------------------------------------------------------------
describe("applyReview - counters", () => {
    test("a correct answer increments times_correct only", () => {

        //fake card with correct answer.
        const res = applyReview(make_card({times_correct: 3, times_incorrect: 2}), true, NOW);

        //expect times_correct to be 4
        expect(res.times_correct).toBe(4);
        expect(res.times_incorrect).toBe(2);
    });

    test("a wrong answer increments times_incorrect only", () => {

        //fake card with correct answer.
        const res = applyReview(make_card({times_correct: 3, times_incorrect: 2}), false, NOW);

        //expect times_correct to be 1
        expect(res.times_correct).toBe(3);
        expect(res.times_incorrect).toBe(3);
    });
})
