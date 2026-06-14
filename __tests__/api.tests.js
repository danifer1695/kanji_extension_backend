//Tell node to use .env.test for env variables instead of the default .env
require("dotenv").config({path: ".env.test"});

const request = require("supertest");
const app = require("../index");
const pool = require("../db");

//Empty tables out before each test.
beforeEach(async () => {
    await pool.query("DELETE FROM saved_kanji");
    await pool.query("DELETE FROM users");
});

//After all tests are done, close connection with DB
afterAll(async () => {
    await pool.end();
});

//Helpers-------------------------------------------------------------------------
//Register a user and return their auth token.
async function get_token(email = "test@test.com", password = "password123")
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
            .send({email: "test@test.com", password: "password123"});

        //assert status code and response body
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
    });

    //Remember: we set the db tables to be wiped between tests.
    test("rejects duplicate email", async () => {

        //Create anew account
        await request(app)
            .post("/auth/register")
            .send({email: "test@test.com", password: "password123"});

        //Create another account using same credentials.
        const res = await request(app)
            .post("/auth/register")
            .send({email: "test@test.com", password: "password123"});

        //./routes/auth defines status 409 as the one to be thrown when
        //Postgres detects an attempt to add a duplicate to a value with a "unique" constraint.
        expect(res.status).toBe(409);
    });

    test("rejects missing fields", async () => {
        const res = await request(app)
            .post("/auth/register")
            .send({email: "test@test.com"});

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
            .send({email: "test@test.com", password: "password123"});

        //Login using credentials we just created.
        const res = await request(app)
            .post("/auth/login")
            .send({email: "test@test.com", password: "password123"});

        //Check for token.
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    test("rejects wrong password", async() => {
        //register account.
        await request(app)
            .post("/auth/register")
            .send({email: "test@test.com", password: "password123"});

        //Attempt to log in with the wrong pass.
        const res = await request(app)
            .post("/auth/login")
            .send({email: "test@test.com", password: "wrongPass"});

        //Assert response status.
        expect(res.status).toBe(401);
    })
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
