const express = require("express");
const router = express.Router();
const pool = require("../db");      //get the pool object we create in db.js containing DB info
const auth_guard = require("../middleware/auth");
const {validate, validate_query, kanji_schema, single_kanji_schema} = require("../middleware/validate");

//router.use(auth_guard) sets auth_guard to fire whenever there is an incoming request 
//for any of the FOLLOWING routes. Meaning it does not apply to routes declared before it
router.use(auth_guard); 

//Routes-----------------------------------------------------------------------------------------
//
//TO DO: route to GET just one kanji, route to GET database size
//
//GET /kanji - fetch all saved kanji
router.get("/", async (req, res) => {
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
});

//GET /kanji/contains - checks whether database contains a specific kanji or not.
//Requests should be formatted as "GET/kanji/contains?kanji=食"
//Response contains a boolean value. 
router.get("/contains", validate_query(single_kanji_schema), async (req, res) => {
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
    
});
 
//GET /kanji/size - returns the amount of kanji saved by this user.
router.get("/size", async (req, res) => {
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
});

//POST /kanji - save a kanji to db, 
//response body contains all rows added to the db
router.post("/", validate(kanji_schema), async (req, res) => {
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
});

//DELETE /kanji/:char - remove a kanji from the db
//":char" is a placeholder where the actual kanji will go.
//so the actual endpoint request would be something like "DELETE /kanji/山"
router.delete("/:char", async (req, res) => {
    try {
        await pool.query("DELETE FROM saved_kanji WHERE kanji = $1 AND user_id = $2", 
            [req.params.char, req.user.id]);
        res.status(204).send();
    } 
    catch (e) 
    {
        res.status(500).json({error: e.message});
    }
});

//module.export will export the behaviour written in this script when this route is called using require()
module.exports = router;
