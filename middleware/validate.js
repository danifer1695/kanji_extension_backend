const {z} = require("zod");

//Schemas---------------------------------------------------------------------

const register_schema = z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters long."),
});

const login_schema = z.object({
    email: z.email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

const single_kanji_schema = z.object({
    kanji: z.string().regex(/^[\u4e00-\u9fff]$/, "Kanji must be a single CJK character."),
})

//maje sure kanji field contains a kanji character (within the unicode CJK character range)
const kanji_schema = z.object({
    kanji: z.string().regex(/^[\u4e00-\u9fff]$/, "Kanji must be a single CJK character."),
    on_readings: z.array(z.string()),
    kun_readings: z.array(z.string()),
    meanings: z.array(z.string()).min(1, "Meanings cannot be empty."),
    jlpt: z.number().int().min(1).max(5).nullable(),
    saved_at: z.number(),
});

//Change password validation.
const change_password_schema = z.object({
    current_password: z.string().min(1, "Please enter your current password."),
    new_password: z.string().min(8, "New password must be at least 8 characters long"),
});

//Validation------------------------------------------------------------------

//Validates a request's body against a given schema.
//On success, the request's body is replaced with the parsed & coerced (cast) data.
//On failure, a response is sent back with status 400.
function validate(schema)
{
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success)
        {
            return res.status(400).json({error: result.error.issues[0].message});
        }

        req.body = result.data;
        next();
    };
}

function validate_query(schema)
{
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if(!result.success)
        {
            return res.status(400).json({error: result.error.issues[0].message});
        }

        req.body = result.data;
        next();
    }
}

//export module
module.exports = {validate, validate_query, register_schema, login_schema, kanji_schema, single_kanji_schema, change_password_schema};
