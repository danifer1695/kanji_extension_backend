//pull JWT library
const jwt = require("jsonwebtoken");

//Get .env file variables
require("dotenv").config();

//Middleware sits between a request and the route handler.
//this function acts as a bouncer, verifying the token is legit and not expired, then passing
//the request with decoded data downstream
function auth_guard(req, res, next)
{
    //header contains metadata in the form of value pairs.
    //the "authorization" key holds a value of "Bearer 3jfu78...", the last element being the token.
    const header = req.headers["authorization"];
    const token = header && header.split(" ")[1];   //returns just "<token>" from "Bearer <token>"

    //If there was no authorization header, or it was malformed, return early.
    if(!token) return res.status(401).json({error: "No token provided"});

    try{
        //decrypt the token using encrypting code stored in .env
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        //{id, email} now becomes available  in every protected route
        req.user = decoded;

        //pass the request to the next element in line.
        next();
    }
    catch(e)
    {
        res.status(403).json({error: "Invalud or expired token"});
    }
}

//exports function "auth_guard" so that outside scripts can require() it
module.exports = auth_guard;
