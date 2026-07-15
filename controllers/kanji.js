const pool = require("../public/db");      //get the pool object we create in db.js containing DB info
const wanakana = require("../lib/wanakana.min.js");

//fetch all saved kanji
const fetch_all_kanji = async (req, res) => {
    try {
        const result = await pool.query(
            //Query all kanji from the db and sort by saved date & time
            "SELECT * FROM saved_kanji WHERE user_id = $1 ORDER BY saved_at DESC",
            [req.user.id]
        );
        //return response in json format with status code 200
        res.status(200).json(result.rows);
    }
    catch(e)
    {
        res.status(500).json({error: e.message});
    }
};

//checks whether database contains a specific kanji or not.
//Requests should be formatted as "GET/kanji/contains?kanji=食"
//Response contains a boolean value. 
const contains_kanji = async (req, res) => {
    //get kanji from request query.
    const {kanji} = req.query;
    
    //Query database.
    try
    {
        const results = await pool.query(`
            SELECT * FROM saved_kanji WHERE kanji = $1 AND user_id = $2`, 
            [kanji, req.user.id]
        );
        
        //Return true or false dending on whether any results were found or not.
        res.status(200).json(results.rows.length > 0);
    }
    catch(e)
    {
        res.status(500).json({error: e.message});
    }
    
};
 
//returns the amount of kanji saved by this user.
const collection_size = async (req, res) => {
    //query the database.
    try
    {
        const size = await pool.query(`
            SELECT COUNT(*)::int FROM saved_kanji WHERE user_id = $1`,
            [req.user.id]
        );
        
        res.status(200).json(size.rows[0].count);
    }
    catch(e)
    {
        res.status(500).json({error: e.message});
    }
};

//save a kanji to db, 
//response body contains all rows added to the db
const save_kanji = async (req, res) => {
    //initialize all these constants with the fields with the same name inside req's body
    const{kanji, on_readings, kun_readings, meanings, jlpt, saved_at} = req.body;
    try
    {
        //send transaction to db
        //pool.query returns all rows added to the database
        const result = await pool.query(`
            INSERT INTO saved_kanji (kanji, on_readings, kun_readings, meanings, jlpt, saved_at, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (kanji, user_id) DO NOTHING
            RETURNING *`,
            [kanji, on_readings, kun_readings, meanings, jlpt, saved_at, req.user.id]
        );
        res.status(201).json(result.rows[0]);
    }
    catch (e)
    {
        res.status(500).json({error: e.message});
    }
};

//remove a kanji from the db
//":char" is a placeholder where the actual kanji will go.
//so the actual endpoint request would be something like "DELETE /kanji/山"
const remove_kanji = async (req, res) => {
    try {
        await pool.query("DELETE FROM saved_kanji WHERE kanji = $1 AND user_id = $2", 
            [req.params.char, req.user.id]);
        res.status(204).send();
    } 
    catch (e) 
    {
        res.status(500).json({error: e.message});
    }
};

//queries kanjiapi for kanjis with matchin readings - where "xxx" is the reading.
const kanji_from_reading = async (req, res) => {
    //destructure the query from the request.
    const {query} = req.query;
    
    //check that query is not empty
    if(!query) return res.status(400).json({error: "Query parameter must not be empty"});

    try
    {
        //get a list of kanji from the processed query
        const results = await fetch_kanji_for_query(query);

        if(!results || results.length === 0)
            return res.status(200).json([]);

        //filter out nulls.
        const filtered = results.filter(k => k !== null);
        res.status(200).json(filtered);
    }
    catch (e)
    {
        res.status(500).json({error: e.message});
    }
};

//module.export will export the behaviour written in this script when this route is called using require()
module.exports = {fetch_all_kanji, contains_kanji, collection_size, save_kanji, remove_kanji, kanji_from_reading};

//Helpers----------------------------------------------------------------------------------------
//Fetches kanji list from kanjiapi.dev from input romaji, hira or katakana.
async function fetch_kanji_for_query(query)
{
    //First check if reading is in romanji, and turn it into katakana if that's the case.
    let reading_kata = "";
    let reading_hira = "";

    //Cover cases for hiragana, katakana and romanji input.
    if(wanakana.isRomaji(query)) 
    {
        reading_kata = wanakana.toKatakana(query);
        reading_hira = wanakana.toHiragana(query);
    }
    else if(wanakana.isHiragana(query)) 
    {
        reading_hira = query;
        reading_kata = wanakana.toKatakana(query); // convert to kata too
    }
    else if(wanakana.isKatakana(query)) 
    {
        reading_kata = query;
        reading_hira = wanakana.toHiragana(query); // convert to hira too
    }
    else
    {
        //if not romaji, hiragana or katakana, return empty list
        return [];
    }

    //destructure two responses from two queries to kanjiapi.dev
    const [res_hira, res_kata] = await Promise.all([
        fetch(`http://kanjiapi.dev/v1/reading/${reading_hira}`).then(r => r.json()).catch(() =>  null),
        fetch(`http://kanjiapi.dev/v1/reading/${reading_kata}`).then(r => r.json()).catch(() =>  null),
    ]);

    //extract the "main_kanji" list from the resulting json
    const kanji_hira = res_hira?.main_kanji ?? [];
    const kanji_kata = res_kata?.main_kanji ?? [];

    //merge lists and remove duplicates
    return [...new Set([...kanji_hira, ...kanji_kata])];
}
