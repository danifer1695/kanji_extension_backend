const rate_limit = require("express-rate-limit");

//Stricter limiter (10 attempts) for routes requiring auth
const auth_limiter = rate_limit({
    windowMs: 15 * 60 * 1000,   //15 minutes (in miliseconds)
    max: 10,                    //10 attempts per IP address
    message: {error: "Too many attempts, please try again later."},
    standardHeaders: true,      //return rate limit info in header.
    legacyHeaders: false,
});

//Looser limiter (100 attempts) for general API routes.
const api_limiter = rate_limit({
    windowMs: 15 * 60 * 1000,   
    max: 100,                   //100 attempts per IP address
    message: {error: "Too many attempts, please try again later."},
    standardHeaders: true,      
    legacyHeaders: false,
});

module.exports = {auth_limiter, api_limiter};
