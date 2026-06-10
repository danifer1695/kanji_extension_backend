const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db.js");
require("dotenv").config();

//Routes--------------------------------------------------------------------------------------------
//GET /health - probe connection with server.
router.get("/health", (req, res) => {
   return res.status(200).json({status: "ok"});
});

//POST /auth/register
router.post("/register", async (req, res) => {
    //get email and password from req and store them in variables "email" and "password"
    const {email, password} = req.body;
    
    if(!email || !password)
        return res.status(400).json({error: "Email and password required"});

    try 
    {
        //"10" is the 'salt rounds' or how many times the password is scrambled up
        const password_hash = await bcrypt.hash(password, 10);
        
        //query database (accessed through pool)
        const result = await pool.query(`
                INSERT INTO users (email, password_hash)
                VALUES ($1, $2) RETURNING id, email`,
                [email, password_hash]
            );
        const user = result.rows[0];

        //encode the user's id and email into a token, which will be read and decoded by middleware/auth.js
        //the token is then signed using JWT_SECRET
        const token = jwt.sign(
            {id: user.id, email: user.email},
            process.env.JWT_SECRET,
            {expiresIn: process.env.JWT_EXPIRES_IN}
        );
        res.status(201).json({token});
    }
    catch(e)
    {
        if (e.code === "23505")
            return res.status(409).json({error: "Email already registered"});
        res.status(500).json({error: e.message});
    }
});

//POST /auth/login
//When a client successfully logs in, this function returns a token.
//the client will then attach this token to every future request requiring authentification so that the server knows to 
//let that request pass.
router.post("/login", async (req, res) => {
    //destructure email, password from req.body
    const {email, password} = req.body;

    //if either email or password are missing or malformed
    if(!email || !password  )
        return res.status(400).json({error: "Email and password required"});

    //query the database, accessed through pool
    try{
        //get the user whose email matches with the one in the request
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1", [email]
        );
        const user = result.rows[0];
        if(!user) return res.status(401).json({error: "Invalid username"});

        //see if password matches the one on the db.
        const match = await bcrypt.compare(password, user.password_hash);
        if(!match) return res.status(401).json({error: "Invalid password"});

        //If the client provided valid credentials, we encode and attach a token to the response,
        //which the client will use to validate future requests.
        const token = jwt.sign(
            {id: user.id, email: user.email},
            process.env.JWT_SECRET,
            {expiresIn: process.env.JWT_EXPIRES_IN}
        );
        res.json({token});
    }
    catch (e)
    {
        res.status(500).json({error: e.message});
    }
});

module.exports = router;
