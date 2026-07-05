const express = require("express");
const router = express.Router();
require("dotenv").config();

const {
    validate, 
    register_schema, 
    login_schema, 
    change_password_schema
} = require("../middleware/validate");

const {
    register_account,
    login_account,
    change_password,
    delete_account,
} = require("../controllers/auth.js");

const auth_guard = require("../middleware/auth.js");

//POST /auth/register
router.post("/register", validate(register_schema), register_account);

//POST /auth/login
router.post("/login", validate(login_schema), login_account);

//POST /auth/password
router.put("/password", auth_guard, validate(change_password_schema), change_password);

//DELETE /auth/account
router.delete("/account", auth_guard, delete_account);

module.exports = router;
