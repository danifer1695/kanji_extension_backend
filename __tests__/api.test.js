//Tell node to use .env.test for env variables instead of the default .env
require("dotenv").config({path: ".env.test"});

const request = require("supertest");
const app = require("../index");
const pool = require("../public/db");
const { auth_limiter, api_limiter } = require("../middleware/rate_limit");
const { fetch_kanji_data } = require("../public/kanjiapi");

//Constants
const SHOKU = {
    kanji: "食",
    on_readings: ["ショク"],
    kun_readings: ["た.べる"],
    meanings: ["eat"],
    jlpt: 4,
    saved_at: Date.now(),
};

//Jest setup----------------------------------------------------------------------
//Mock kanjiapi.dev so that we're not actually requesting to it every time.
//This catches any calls to require(../public/kanjiapi) and it runs 
//the functions defined in here instead of the ones in the real module.
//fn() creates a mock function. called with no parameters returns undefined.
jest.mock("../public/kanjiapi", () => ({
    fetch_kanji_data: jest.fn(),
}));

//Empty tables out before each test.
beforeEach(async () => {
    await pool.query("DELETE FROM saved_kanji");
    await pool.query("DELETE FROM users");

    //Reset rate limit before each test, so that limit is not reached between tests.
    //"127.0.0.1" is the IPv4 SuperTest uses when making requests.
    await auth_limiter.resetKey("127.0.0.1");
    await api_limiter.resetKey("127.0.0.1");

    //we are telliing jest to return a promise that resolves 
    //to "SHOKU" when fetch_kanji_data is called.
    //this is possible because we intercepted this module call with jest.mock()
    //Result - any call to fetch_kanji_data will return SHOKU no matter what parameter we feed it.
    fetch_kanji_data.mockResolvedValue(SHOKU);
});

//After all tests are done, close connection with DB
afterAll(async () => {
    await pool.end();
});

//Helpers-------------------------------------------------------------------------
//Register a user and return their auth token.
async function get_token(username = "api@test.com", password = "password123")
{
    const res = await request(app)
        .post("/auth/register")
        .send({username, password});
    return res.body.token;
}

//save a kanji to the database (needs token)
async function save_shoku(token)
{
    await request(app)
        .post("/kanji")
        .set("Authorization", `Bearer ${token}`)
        .send(SHOKU);

    const {rows} = await pool.query(
        "SELECT id FROM saved_kanji WHERE kanji = $1",
        [SHOKU.kanji]
    );
    return rows[0].id;
}

async function read_card(id)
{
    const {rows} = await pool.query("SELECT * FROM saved_kanji WHERE id = $1", [id]);
    return rows[0];
}

//TESTS---------------------------------------------------------------------------
//Auth-----------------------------
describe("POST /auth/register", () => {
    test("creates a user and returns a token", async () => {

        //create a new account
        const res = await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "password123"});

        //assert status code and response body
        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
    });

    //Remember: we set the db tables to be wiped between tests.
    test("rejects duplicate username", async () => {

        //Create anew account
        await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "password123"});

        //Create another account using same credentials.
        const res = await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "password123"});

        //./routes/auth defines status 409 as the one to be thrown when
        //Postgres detects an attempt to add a duplicate to a value with a "unique" constraint.
        expect(res.status).toBe(409);
    });

    test("rejects missing fields", async () => {
        const res = await request(app)
            .post("/auth/register")
            .send({username: "api@test.com"});

        //./routes/auth defines status 400 as the one to be thrown when
        //either 'username' or 'password' was not included in the request.
        expect(res.status).toBe(400);
    });
});

describe("POST /auth/login", () => {
    test("returns a token with valid credentials", async() => {
        //register account.
        await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "password123"});

        //Login using credentials we just created.
        const res = await request(app)
            .post("/auth/login")
            .send({username: "api@test.com", password: "password123"});

        //Check for token.
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
    });

    test("rejects wrong password", async() => {
        //register account.
        await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "password123"});

        //Attempt to log in with the wrong pass.
        const res = await request(app)
            .post("/auth/login")
            .send({username: "api@test.com", password: "wrongPass"});

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
            .send({username: "api@test.com", password: "newPassword"});

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
            "SELECT id FROM users WHERE username = $1",
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
            .send({username: "api@test.com", password: "password123"});

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
});

describe("GET /kanji/search?query=...", () => {
    test("successfully retrieves matching kanji from katakana reading", async () => {
        //log in and get auth token.
        const token = await get_token();

        //make a request using kana as query.
        const res = await request(app)
            .get("/kanji/search?query=ショク")
            .set("Authorization", `Bearer ${token}`);

        //expect 食 to be among the results
        expect(res.body).toContain("食");
    });

    test("successfully retrieves matching kanji from hiragana reading", async () => {
        //log in and get auth token.
        const token = await get_token();

        //make a request using kana as query.
        const res = await request(app)
            .get("/kanji/search?query=しょく")
            .set("Authorization", `Bearer ${token}`);

        //expect 食 to be among the results
        expect(res.body).toContain("食");
    });

    test("successfully retrieves matching kanji from romaji reading", async () => {
        //login and get auth token.
        const token = await get_token();

        //make a request using romaji as a query
        const res = await request(app)
            .get("/kanji/search?query=shoku")
            .set("Authorization", `Bearer ${token}`);

        //expect 食 to be among the results
        expect(res.body).toContain("食");
    });

    test("return status code 400 on empty query", async () => {
        //login and get auth token.
        const token = await get_token();

        //make a request using romaji as a query
        const res = await request(app)
            .get("/kanji/search")
            .set("Authorization", `Bearer ${token}`);

        //expect 食 to be among the results
        expect(res.status).toBe(400);
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

describe("GET /kanji/size", () => {
    test("returns valid database size", async () => {
        //create an account, get token.
        const token = await get_token();

        //add a kanji to the database.
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

        //send request for database size.
        const res = await request(app)
            .get("/kanji/size")
            .set("Authorization", `Bearer ${token}`);

        //Expect a size of 1.
        expect(res.body).toBe(1);
    });

    test("returns valid size on an empty database", async () => {
        //create an account, get token.
        const token = await get_token();

        //send request for database size.
        const res = await request(app)
            .get("/kanji/size")
            .set("Authorization", `Bearer ${token}`);

        //Expect a size of 1.
        expect(res.body).toBe(0);
    });
});

//Input Validation-----------------
describe("Input validation", () => {
    test("rejects short username on register", async () => {

        //Send request with an username not formatted like an username.
        const res = await request(app)
            .post("/auth/register")
            .send({username: "ts", password: "password123"});

        //Check that response returns with status code 400
        expect(res.status).toBe(400);
    });

    test("rejects short password on register", async () => {

        //Send request with a password that is less than 8 chars long (rules set in middleware/validate)
        const res = await request(app)
            .post("/auth/register")
            .send({username: "api@test.com", password: "pass"});

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
                .send({username: "api@test.com", password: "password123"});
        }

        //Expect status to be 429
        //express-rate-limit returns status 429 by default on rate limit trigger.
        expect(last_res.status).toBe(429);
    });
});

//SRS------------------------------

describe("GET /practice/next", () => {
    test("returns 401 without a token", async () => {
        
        //send request without authentification
        const res = await request(app)
            .get("/practice/next");

        //Expect response status 401
        expect(res.status).toBe(401);
    });

    test("returns a due card with a prompt type", async () => {

        //login, get token.
        const token = await get_token();
        const id = await save_shoku(token);

        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${token}`);
        const data = res.body.card;

        expect(res.status).toBe(200);
        expect(data.id).toBe(id);
        expect(data.kanji).toBe("食");
        expect(["reading", "meaning"]).toContain(data.prompt_type);

    });

    test("response does not send the accepted answer with the question", async () => {

        //login, get token, add SHOKU to database.
        const token = await get_token();
        const id = await save_shoku(token);

        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${token}`);

        //stringify body to be able to scan it at once
        const body = JSON.stringify(res.body);
        expect(body).not.toContain("ショク");
        expect(body).not.toContain("た.べる");
        expect(body).not.toContain("eat");

    });

    test("returns card: null and the next due date when nothing is due", async () => {

        //login, get token, add a kanji to db, get its id
        const token = await get_token();
        const id = await save_shoku(token);

        //update due date so that it is not yet due
        await pool.query(
            "UPDATE saved_kanji SET next_review = NOW() + INTERVAL '5 hours' WHERE id = $1",
            [id]
        );
        
        //send request
        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${token}`)

        expect(res.status).toBe(200);
        expect(res.body.card).toBeNull();
        expect(res.body.next_due_at).toBeDefined();
        expect(new Date(res.body.next_due_at).getTime()).toBeGreaterThan(Date.now());
    });

    test("returns card: null with no next due date if user has no saved kanji", async () => {

        //login, get token
        const token = await get_token();

        //send request without adding a kanji to db
        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${token}`)

        //"card" and "next_due_at" should be null
        expect(res.status).toBe(200);
        expect(res.body.card).toBeNull();
        expect(res.body.next_due_at).toBeNull();
    });

    test("returns most overdue card first", async () => {

        //login, get token, save shoku kanji
        const token = await get_token();

        //save "water" kanji first, becomes most overdue element
        await request(app)
            .post("/kanji")
            .set("Authorization", `Bearer ${token}`)
            .send({
                kanji: "水",
                on_readings: ["スイ"],
                kun_readings: ["みず"],
                meanings: ["water"],
                jlpt: 5,
                saved_at: Date.now(),                
            });

        //then save shoku, becomes second in line
        const shoku_id = await save_shoku(token);

        //request next overdue kanji
        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${token}`);

        //should expect "water" to be in response
        expect(res.status).toBe(200);
        expect(res.body.card.id).not.toBe(shoku_id);
        expect(res.body.card.kanji).toBe("水");
    });

    test("does not serve another user's cards", async () => {

        //create owner and other user's account, get token.
        const owner = await get_token("ownerUser", "password123");
        const other = await get_token("otherUser", "password123");

        //save shoku using owner's token
        await save_shoku(owner);

        //request next from other user's account
        const res = await request(app)
            .get("/practice/next")
            .set("Authorization", `Bearer ${other}`);

        //expect null card and next_due_at
        expect(res.status).toBe(200);
        expect(res.body.card).toBeNull();
        expect(res.body.next_due_at).toBeNull();
    });
});

//Reviewing------------------------

describe("POST /practice/:id/review", () => {
    test("returns 401 without a token", async () => {

        //send a request without attaching a token to it.
        const res = await request(app)
            .post("/practice/1/review")
            .send({answer: "eat", prompt_type: "meaning"});

        expect(res.status).toBe(401);
        expect(res.body.error).toBeDefined();
    });

    test("grades a correct meaning and increases mastery level", async () => {

        //get token, then kanji entry id
        const token  = await get_token();
        const id = await save_shoku(token);

        //send request to review whether the "meaning" of SHOKU is "eat"
        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "eat", prompt_type: "meaning"});

        expect(res.status).toBe(200);
        expect(res.body.correct).toBe(true);
        expect(res.body.mastery_level).toBe(1);
        expect(res.body.next_review).toBeDefined();

        //check that the database actually updated, not just the response.
        const card = await read_card(id);
        expect(card.mastery_level).toBe(1);
        expect(card.times_correct).toBe(1);
        expect(card.times_incorrect).toBe(0);
        expect(new Date(card.next_review).getTime()).toBeGreaterThan(Date.now());
    });

    test("grades a wrong answer and increases times_incorrect", async () => {

        //get token, save shoku kanji, get entry id
        const token  = await get_token();
        const id = await save_shoku(token);

        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "drink", prompt_type: "meaning"});

        expect(res.body.correct).toBe(false);

        const card = await read_card(id);
        expect(card.mastery_level).toBe(0);
        expect(card.times_incorrect).toBe(1);
    });

    test("accepts a reading typed in romaji", async () => {

        //get token, save shoku, get entry id
        const token  = await get_token();
        const id = await save_shoku(token);

        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "taberu", prompt_type: "reading"});

        expect(res.body.correct).toBe(true);
    });

    test("accepts a reading typed in katakana", async () => {

        //get token, save shoku, get entry id
        const token = await get_token();
        const id = await save_shoku(token);

        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "ショク", prompt_type: "reading"});

        expect(res.body.correct).toBe(true);
    });

    test("accepts a reading typed in hiragana", async () => {

        const token = await get_token();
        const id = await save_shoku(token);

        //send a request containing a valid hiragana reading
        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "たべる", prompt_type: "reading"});

        expect(res.body.correct).toBe(true);
    });

    test("accepts any of the listed meanings", async () => {

        const token = await get_token();
        const id = await save_shoku(token);

        //send a request containing a valid meaning
        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "eat", prompt_type: "meaning"});

        //expect correct response
        expect(res.body.correct).toBe(true);
    });

    test("returns accepted answers after grading", async () => {

        const token = await get_token();
        const id = await save_shoku(token);

        //send an invalid answer
        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${token}`)
            .send({answer: "wrong", prompt_type: "meaning"});

        //expect response to contain expected answers
        expect(res.body.accepted_answers).toContain("eat");
    });

    test("returns 404 for another user's kanji", async () => {

        //Create two accounts for two distinct users
        const owner = await get_token("ownerUser123", "password123");
        const other = await get_token("otherUser234", "password123");

        //save shoku with owner's token
        const id = await save_shoku(owner);

        //attempt to review shoku with other user's credentials
        const res = await request(app)
            .post(`/practice/${id}/review`)
            .set("Authorization", `Bearer ${other}`)
            .send({answer: "eat", prompt_type: "meaning"});

        //expect a 404 status
        expect(res.status).toBe(404);
    });

    test("review on one user's kanji does not affect another user's identical entry", async () => {

        //Create two accounts for two distinct users
        const owner = await get_token("ownerUser123", "password123");
        const other = await get_token("otherUser234", "password123");

        //save shoku with both accounts
        const ownerId = await save_shoku(owner);
        const otherId = await save_shoku(other);

        //send request with valid answer using owner's id
        await request(app)
            .post(`/practice/${ownerId}/review`)
            .set("Authorization", `Bearer ${owner}`)
            .send({answer: "eat", prompt_type: "meaning"});

        //send request with valid answer using owner's id
        await request(app)
            .post(`/practice/${otherId}/review`)
            .set("Authorization", `Bearer ${other}`)
            .send({answer: "wrong", prompt_type: "meaning"});

        const ownerCard = await read_card(ownerId);
        const otherCard = await read_card(otherId);

        //expect owner to have advanced to mastery 1, other to still be at 0
        expect(ownerCard.mastery_level).toBe(1);
        expect(otherCard.times_incorrect).toBe(0);
    });
});
