//express builds the skeleton object that knows hot to listen on a port and receive HTTP requests.
//for example, without express, I'd have to parse through GET and POST endpoints manually
const express = require("express");
const app = express();

//CORS enables communication between different origins. In this project,
//railway's server would be one origin, the browser extension is another.
//By default, the browser would block a request coming from the extension to the server at railway / localhost.
//CORS tells the browser where to accept requests from ("*" meaning from anywhere)
const cors = require("cors");

const {auth_limiter, api_limiter} = require("./middleware/rate_limit");

//get the .env file, where variables such as "PORT" are stored.
require("dotenv").config();

app.use(express.json());
app.use(cors({
    //We pass a lambda to be fired by Express every time that a request is received
    origin: '*',
    methods: ["GET", "POST", "DELETE", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
//'/*splat' is Express 5's new widcard, what usually is just "*"

//Routes----------------------------------------------------------------------

//GET /health - probe connection with server.
app.get("/health", (req, res) => {
   res.status(200).json({status: "ok"});
});

//get the "/kanji" route so we can access the endpoints defined in kanji.js
app.use("/auth", auth_limiter, require("./routes/auth"));
app.use("/kanji", api_limiter, require("./routes/kanji"));

//----------------------------------------------------------------------------

//Split the path so that "node index.js" can start the server normally but 
//jest can request("index") starting to listen to a port.
if(require.main === module) {

    //get the port defined in dotenv or if that cannot be found, set it to 3000 by default
    const PORT = process.env.PORT || 3000;

    //Listen at given port
    app.listen(PORT, () => console.log(`Shirabeyou API running on port ${PORT}`));
}

module.exports = app;
