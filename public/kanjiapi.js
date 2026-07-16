//API url constant
const API_URL = "https://kanjiapi.dev/v1/";

//Fetch single kanji data from kanjiapi.dev
async function fetch_kanji_data(kanji)
{
    const kanji_response = await fetch(`${API_URL}kanji/${kanji}`);
    if (!kanji_response.ok) return null;
    const kanji_data = await kanji_response.json();
    
    return kanji_data;
}

module.exports = {fetch_kanji_data};
