const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db.js");
require("dotenv").config();

//Here we are passing two functions to this route. 
//validate runs first, then if all goes well, the "next()" call within 
//it passes control to "async (req, res)"
const register_account = async (req, res) => {
    //get email and password from req and store them in variables "email" and "password"
    const {email, password} = req.body;

    try 
    {
        //"10" is the 'salt rounds' or how many times the password is scrambled up
        const password_hash = await bcrypt.hash(password, 10);
        
        //query database (accessed through pool)
        const result = await pool.query(`
                INSERT INTO users (email, password_hash)
                VALUES ($1, $2) 
                RETURNING id, email`,
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
        //Postgres throws an error code 23505 when we attempt to insert a duplicate of a unique value.
        //We want to catch that and translate into a status code 409.
        if (e.code === "23505")
            return res.status(409).json({error: "Email already registered"});

        res.status(500).json({error: e.message});
    }
};

//When a client successfully logs in, this function returns a token.
//the client will then attach this token to every future request requiring authentification so that the server knows to 
//let that request pass.
const login_account = async (req, res) => {

    //destructure email, password from req.body
    const {email, password} = req.body;

    //query the database, accessed through pool
    try{
        //get the user whose email matches with the one in the request
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1", [email]
        );
        //get first item because email has a 'unique' constraint, 
        //so there should only be one returned row.
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

        //shorthand for res.json({token: token}). takes the variable name as the key, and the variable's 
        //contained value as the value. So the reponse would read like {token: "j9238r67eijf3u88479..."}
        res.json({token});
    }
    catch (e)
    {
        res.status(500).json({error: e.message});
    }
};

//Password changing route.
//We pass auth_guard because we want the user to have a valid auth token to be able to do this action.
const change_password = async (req, res) => {

    //destructure email and pass from the request's body.
    const {current_password, new_password} = req.body;

    //We do not want users to be able to alter the test account.
    if(req.user.email === "test@test.com") return res.status(403).json({error: "Test account credentials cannot be modified."});

    //use pool to access the database, query it to change the password
    try
    {
        //Query the hashed password with a matching user ID
        const result = await pool.query(
            "SELECT password_hash FROM users WHERE id = $1",
            [req.user.id]
        );
        const user = result.rows[0];
        if(!user) return res.status(404).json({error: "User not found."});

        //use bcrypt's compare function to compare current_password to the queried result.
        const match = await bcrypt.compare(current_password, user.password_hash);
        if(!match) return res.status(401).json({error: "Current password is incorrect."});

        //use bcrypt to hash the new password (10 salt rounds) and then add it to the database.
        const new_hash = await bcrypt.hash(new_password, 10);
        await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2",
            [new_hash, req.user.id]
        );

        //return 'ok' status 200
        res.status(200).json({message: "Password successfully updated."});
    }
    catch (e)
    {
        res.status(500).json({error: e.message});
    } 
};

//Delete account.
const delete_account = async (req, res) => {

    //We do not want the users to be able to delete the test account.
    if(req.user.email === "test@test.com") return res.status(403).json({error: "Test account cannot be deleted."});

    try
    {
        //----ON DELETE CASCADE in SQL database takes care of deleting related entries.----
        //Delete all kanji entries belinging to this account. 
        //await pool.query(
        //    "DELETE FROM saved_kanji WHERE user_id = $1",
        //    [req.user.id]
        //);

        //Delete the user itself.
        await pool.query(
            "DELETE FROM users WHERE id = $1",
            [req.user.id]
        );

        res.status(204).send();
    }
    catch(e)
    {
        return res.status(500).json({error: e.message});
    }

};

//-------------------------------------------------------------------------------------------------

module.exports = {register_account, login_account, delete_account, change_password};
