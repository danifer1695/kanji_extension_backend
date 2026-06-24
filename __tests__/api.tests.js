//Tell node to use .env.test for env variables instead of the default .env
require("dotenv").config({path: ".env.test"});

const request = require("supertest");
const app = require("../index");
const pool = require("../db");
const { auth_limiter, api_limiter } = require("../middleware/rate_limit");

//Empty tables out before each test.
beforeEach(async () => {
    await pool.query("DELETE FROM saved_kanji");
    await pool.query("DELETE FROM users");

    //Reset rate limit before each test, so that limit is not reached between tests.
    //"127.0.0.1" is the IPv4 SuperTest uses when making requests.
    await auth_limiter.resetKey("127.0.0.1");
    await api_limiter.resetKey("127.0.0.1");
});

//After all tests are done, close connection with DB
afterAll(async () => {
    await pool.end();
});

//Helpers-------------------------------------------------------------------------
//Register a user and return their auth token.
async function get_token(email = "api@test.com", password = "password123")
{
    const res = await request(app)
        .post("/auth/register")
        .send({email, password});
    return res.body.token;
}

//TESTS---------------------------------------------------------------------------
//Auth-----------------------------
describe("POST /auth/register", () => {
    test("creates a user and returns a token", async () => {

        //create a new account
        const res = await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "password123"});

        //assert status code and response body
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
    });

    //Remember: we set the db tables to be wiped between tests.
    test("rejects duplicate email", async () => {

        //Create anew account
        await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "password123"});

        //Create another account using same credentials.
        const res = await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "password123"});

        //./routes/auth defines status 409 as the one to be thrown when
        //Postgres detects an attempt to add a duplicate to a value with a "unique" constraint.
        expect(res.status).toBe(409);
    });

    test("rejects missing fields", async () => {
        const res = await request(app)
            .post("/auth/register")
            .send({email: "api@test.com"});

        //./routes/auth defines status 400 as the one to be thrown when
        //either 'email' or 'password' was not included in the request.
        expect(res.status).toBe(400);
    });
});

describe("POST /auth/login", () => {
    test("returns a token with valid credentials", async() => {
        //register account.
        await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "password123"});

        //Login using credentials we just created.
        const res = await request(app)
            .post("/auth/login")
            .send({email: "api@test.com", password: "password123"});

        //Check for token.
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    test("rejects wrong password", async() => {
        //register account.
        await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "password123"});

        //Attempt to log in with the wrong pass.
        const res = await request(app)
            .post("/auth/login")
            .send({email: "api@test.com", password: "wrongPass"});

        //Assert response status.
        expect(res.status).toBe(401);
    });
});

describe("PUT /auth/password", () => {
    test("changes password with valid credentials", async () => {
        //register account, get token.
        const token = await get_token();

        //request a pasword change.
        const res = await request(app)
            .put("/auth/password")
            .set("Authorization", `Bearer ${token}`)
            .send({current_password: "password123", new_password: "newPassword"});

        //expect status code 200.
        expect(res.status).toBe(200);

        //verify new password by logging in with it.
        const login = await request(app)
            .post("/auth/login")
            .send({email: "api@test.com", password: "newPassword"});

        //expect status code to be 200 and for the token to be 
        //inside the response's json
        expect(login.status).toBe(200);
        expect(login.body.token).toBeDefined();
    });

    test("rejects incorrect current password", async () => {
        //register account, get token.
        const token = await get_token();

        //request a password change but give the wrong current pass.
        const res = await request(app)
            .put("/auth/password")
            .set("Authorization", `Bearer ${token}`)
            .send({current_password: "wrongPass", new_password: "newPassword"});

        //expect status 401.
        expect(res.status).toBe(401);
    });

    test("rejects new password if its too short", async () => {
        //regiester account, get token.
        const token  = await get_token();

        //request a password change, give a password that is <8 chars long.
        const res = await request(app)
            .put("/auth/password")
            .set("Authorization", `Bearer ${token}`)
            .send({current_password: "password123", new_password: "short"});

        //expect status code 400
        expect(res.status).toBe(400);
    });

    test("bounces requests without token", async () => {
        //send a request without a token.
        const res = await request(app)
            .put("/auth/password")
            .send({current_password: "password123", new_password: "newPassword"});

        //expect code 401.
        expect(res.status).toBe(401);
    });

    test("returns code 403 to an attempt to modify the test account", async () => {
        //make an account with test@test.com credentials.
        const token = await get_token("test@test.com", "password123");

        //attempt to delete it.
        const res = await request(app)
            .put("/auth/password")
            .set("Authorization", `Bearer ${token}`)
            .send({current_password: "password123", new_password: "password456"});

        //expect a "forbidden" 403 error code
        expect(res.status).toBe(403);
    });
});

describe("DELETE /auth/account", () => {
    test("deletes an account and all of its saved kanji", async () => {
        //Create account, get token.
        const token = await get_token();

        //Get user's id to later be able to check on the database.
        const id_query = await pool.query(
            "SELECT id FROM users WHERE email = $1",
            ["api@test.com"]
        );
        const user_id = id_query.rows[0].id;

        //Save a kanji so we can later verify it was deleter.
        await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });
        
        //Request account deletion.
        const res = await request(app)
            .delete("/auth/account")
            .set("Authorization", `Bearer ${token}`);

        //Expect response status code 204.
        expect(res.status).toBe(204);

        //Verify account is gone by trying to log in.
        const login = await request(app)
            .post("/auth/login")
            .set("Authorization", `Bearer ${token}`)
            .send({email: "api@test.com", password: "password123"});

        expect(login.status).toBe(401);

        //Verify kanji are gone too.
        const kanji_check = await pool.query(
            "SELECT * FROM saved_kanji WHERE user_id = $1",
            [user_id]
        );
        expect(kanji_check.rows).toHaveLength(0);
    });
    
    test("Bounces request without a token", async () => {
        //make a request without passing a token.
        const res = await request(app)
            .delete("/auth/account");
        
        //expect response status to be 401
        expect(res.status).toBe(401);
    });

    test("returns code 403 to an attempt to delete the test account", async () => {
        //make an account with test@test.com credentials.
        const token = await get_token("test@test.com", "password123");

        //attempt to delete it.
        const res = await request(app)
            .delete("/auth/account")
            .set("Authorization", `Bearer ${token}`);

        //expect a "forbidden" 403 error code
        expect(res.status).toBe(403);
    });
});

//Kanji----------------------------
describe("GET /kanji", () => {
    test("returns 401 without a token", async () => {
        //we attempt to fetch without having logged it (no auth token)
        const res = await request(app)
            .get("/kanji");

        //assert status code.
        expect(res.status).toBe(401);
    });

    test("returns empty array for new users", async () => {
        //register new account and get token, using our helper.
        const token  = await get_token();

        //make a request for all saved kanji (none right now) using token.
        const res = await request(app)
            .get("/kanji")
            .set("Authorization", `Bearer ${token}`);

        //expect an empty array as a response.
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

describe("GET /kanji/contains", () => {
    test("returns status 400 if kanji is not provided in query", async () => {
        //register account, get token.
        const token = await get_token();

        //make a request, with no kanji it its route.
        const res = await request(app)
            .get("/kanji/contains")
            .set("Authorization", `Bearer ${token}`);
        
        //expect a status 400 in response.
        expect(res.status).toBe(400);
    });

    test("returns false if provided kanji does not exists in database", async () => {
        //register account and get token.
        const token = await get_token();

        //Send request without having saved a kanji.
        const res = await request(app)
            .get("/kanji/contains?kanji=食")
            .set("Authorization", `Bearer ${token}`);

        //Check response is negative
        expect(res.body).toBe(false);
    });

    test("returns true if provided kanji does exist in database", async () => {
        //register account and get token.
        const token = await get_token();

        //save a kanji to the database.
        await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });
        
        //make a request to check if that kanji exists.
        const res = await request(app)
            .get("/kanji/contains?kanji=食")
            .set("Authorization", `Bearer ${token}`);

        //expect response to be true.
        expect(res.body).toBe(true);
    })
})

describe("POST /kanji", () => {
    test("saves kanji and returns it", async () => {
        //use our helper to register an account and get the auth token.
        const token = await get_token();

        //make a request to add a kanji to the database.
        const res = await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });

        //assert response.
        expect(res.status).toBe(201);
        //response body should contain all rows added to the database.
        //we check that the "kanji" element returns expected value.
        expect(res.body.kanji).toBe("食");
    });

    test("returns status 401 without a token", async () => {

        //make a request without setting the Authorization value (without including token).
        const res = await request(app)
            .post("/kanji")
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });

        //return status should be 401, returned by ./middleware/auth.js 
        expect(res.status).toBe(401);
    });
});

describe("DELETE /kanji/:char", () => {
    test("deletes a saved kanji", async () => {

        //create an account, get token.
        const token = await get_token();

        //add a kanji to the database using proper credentials (attaching token)
        await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });

        //delete added kanji, again - attaching the token for authentification.
        const res = await request(app)
            .delete("/kanji/食")
            .set("Authorization", `Bearer ${token}`);

        //check the response's status code is what to expect from ./routes/kanji
        expect(res.status).toBe(204);

        //Now we verify that the entry is actually gone from the database.
        const check = await request(app)
            .get("/kanji")
            .set("Authorization", `Bearer ${token}`);

        expect(check.body).toEqual([]);
    });
});

//Input Validation-----------------
describe("Input validation", () => {
    test("rejects invalid email on register", async () => {

        //Send request with an email not formatted like an email.
        const res = await request(app)
            .post("/auth/register")
            .send({email: "not-an-email", password: "password123"});

        //Check that response returns with status code 400
        expect(res.status).toBe(400);
    });

    test("rejects short password on register", async () => {

        //Send request with a password that is less than 8 chars long (rules set in middleware/validate)
        const res = await request(app)
            .post("/auth/register")
            .send({email: "api@test.com", password: "pass"});

        //Check that response returns with status code 400
        expect(res.status).toBe(400);
    });

    test("rejects multi-character kanji", async () => {

        //Register and get token.
        const token = await get_token();

        //Send request contining more than one character in the "kanji" field.
        const res = await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 4,
                saved_at: Date.now(),
            });

        //Check that response bounces with status code 400.
        expect(res.status).toBe(400);
    });

    test("rejects out-of-range JLPT value", async () => {

        //Register and get token.
        const token = await get_token();

        //Send request with an invalid JLPT value (x<1 || x>5)
        const res = await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "食",
                on_readings: ["ショク"],
                kun_readings: ["た.べる"],
                meanings: ["eat"],
                jlpt: 6,
                saved_at: Date.now(),
            });

        //Expect status code 400.
        expect(res.status).toBe(400);
    });
});


//Rate Limiting--------------------

describe("Rate limiting", () => {
    test("blocks auth requestes after limit is reached", async () => {

        //Fire 11 requests, the 11th should pass the limit and trigger the block
        let last_res;
        for(let i = 0; i < 11; i++)
        {
            //We attempt to log in without having registered.
            last_res = await request(app)
                .post("/auth/login")
                .send({email: "api@test.com", password: "password123"});
        }

        //Expect status to be 429
        //express-rate-limit returns status 429 by default on rate limit trigger.
        expect(last_res.status).toBe(429);
    });
});
