const express = require("express");
const router = express.Router();
const auth_guard = require("../middleware/auth");

const {
    next_practice,
    practice_submit_review
} = require("../controllers/practice");

const {
    validate,
    practice_submit_schema,
} = require("../middleware/validate");

router.use(auth_guard);

//Routes-----------------------------------------------------------------------------------------
//GET /practice/next - 
router.get("/next", next_practice);

//POST /practice/:id/review - send users response to review question, update database according to it.
router.post("/:id/review", validate(practice_submit_schema), practice_submit_review);

module.exports = router;
