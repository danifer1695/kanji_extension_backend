const pool = require("../public/db");
const { applyReview } = require("../public/srs");
const { checkReading, checkMeaning } = require("../public/grading");
const { fetch_kanji_data } = require("../public/kanjiapi");


//GET/practice/next
//Return the single kanji that is due for review next
const next_practice = async (req, res) => {
    try
    {
        const { rows } = await pool.query(
            `SELECT id, kanji, mastery_level 
                FROM saved_kanji 
                WHERE user_id = $1 AND next_review <= NOW()
            ORDER BY next_review ASC
            LIMIT 1`, 
            [req.user.id]
        );

        //If no card is due, just return the due date of the card
        //that is up next.
        if(rows.length === 0)
        {
            const { rows: upcoming } = await pool.query(
                `SELECT MIN(next_review) AS next
                    FROM saved_kanji
                    WHERE user_id = $1`,
                [req.user.id]
            );

            //return null if no results are returned (db empty)
            return res.status(200).json({card: null, next_due_at: (upcoming.length != 0) ? upcoming[0].next : null });
        }

        const card = rows[0];

        //Accepted answers are not included in response here
        res.status(200).json({
            card: {
                id: card.id,
                kanji: card.kanji,
                mastery_level: card.mastery_level,
                //randomply choose to ask for reading or meaning
                prompt_type: Math.random() < 0.5 ? "reading" : "meaning",
            },
        });
    } 
    catch (e)
    {
        //Display error internally, dont send details to client
        res.status(500).json({error: "Internal server error."});
        console.error(e.message);
    }
};

//POST/practice/:id/review
//Expects: an answer and a prompt type ("meaning" or "reading") to the entry with 
//an id matching the one included in the request's parameter.
//retrieves the user's response to a practice question, determines whether it is correct
//or not, then modifies the mastery level / review due dates accordingly.
const practice_submit_review = async (req, res) => 
{
    //destructure answer and prompt type from parsed request data
    const { answer, prompt_type } = req.body;

    const client = await pool.connect();

    try
    {
        await client.query("BEGIN");
        const paramId = parseInt(req.params.id, 10);

        //FOR UPDATE locks the row so that two requests from differenc clients (extension + phone)
        //cannot both read & write at the same time.
        const { rows } = await client.query(
            `SELECT * FROM saved_kanji
                WHERE id = $1 AND user_id = $2
                FOR UPDATE`,
            [paramId, req.user.id]
        );

        //if query result is empty, return response status !ok with error message
        if(rows.length === 0)
        {
            await client.query("ROLLBACK");     //cancel transaction
            return res.status(404).json({error: "Kanji not found"});
        }

        const card = rows[0];
        const data = await fetch_kanji_data(card.kanji);

        //call appropriate function depending on the question prompt
        //to check the correctness of the response.
        const correct = prompt_type === "reading"
            ? checkReading(answer, [...data.kun_readings, ...data.on_readings])
            : checkMeaning(answer, data.meanings);

        //update kanji's review information depending on the anwer given - from public/srs.js
        //(new review deadlines, mastery level, etc)
        const next = applyReview(card, correct);

        const {rows: [updated] } = await client.query(
            `UPDATE saved_kanji
                SET mastery_level = $1, times_correct = $2, times_incorrect = $3,
                    last_reviewed = $4, next_review = $5
                WHERE id = $6
                RETURNING *`,
            [next.mastery_level, next.times_correct, next.times_incorrect, 
            next.last_reviewed, next.next_review, card.id]
        );

        await client.query("COMMIT");

        res.status(200).json({
            correct,
            accepted_answers: prompt_type === "reading"
                ? [...data.kun_readings, ...data.on_readings]
                : data.meanings,
            mastery_level: updated.mastery_level,
            next_review: updated.next_review,
        });
    }
    catch(e)
    {
        try {await client.query("ROLLBACK");} catch {}  //cancel transaction

        //Display error internally, dont send details to client
        res.status(500).json({error: "Internal server error."});
        console.error(e.message);
    }
    finally 
    {
        client.release();
    }
};

module.exports = {next_practice, practice_submit_review};
