const express = require("express");
const router = express.Router();
const auth_guard = require("../middleware/auth");

const {
    fetch_all_kanji, 
    contains_kanji, 
    collection_size,
    save_kanji, 
    remove_kanji, 
    kanji_from_reading
} = require("../controllers/kanji");

const {
    validate, 
    validate_query, 
    kanji_schema, 
    single_kanji_schema
} = require("../middleware/validate");

//router.use(auth_guard) sets auth_guard to fire whenever there is an incoming request 
//for any of the FOLLOWING routes. Meaning it does not apply to routes declared before it
router.use(auth_guard); 

//Routes-----------------------------------------------------------------------------------------

//GET /kanji - fetch all saved kanji
router.get("/", fetch_all_kanji);

//GET /kanji/contains?kanji=[...] - checks whether database contains a specific kanji or not.
router.get("/contains", validate_query(single_kanji_schema), contains_kanji);
 
//GET /kanji/size - returns the amount of kanji saved by this user.
router.get("/size", collection_size);

//POST /kanji - save a kanji to db, 
router.post("/", validate(kanji_schema), save_kanji);

//DELETE /kanji/:char - remove a kanji from the db
router.delete("/:char", remove_kanji);

//GET /kanji/search?query=xxx - where "xxx" is the query to process.
//Returns a list of strings containing resulting kanji
router.get("/search", kanji_from_reading);

//module.export will export the behaviour written in this script when this route is called using require()
module.exports = router;
