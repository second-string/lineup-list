const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");

async function run() {
    const url = "https://www.bottlerocknapavalley.com/2022-artists/";
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const artists = [];
    // $(".artist-name").each((i, e) => {
    //     console.log($(this).text());
    // });

    // the .text() called on the span elements is empty for some reason, so just hack out the artists manually
    const domArtists = $(".artist-name");
    for (var i in Object.keys(domArtists)) {
        const domArtist = domArtists[i];
        if (domArtist === undefined) {
            continue;
        }

        artists.push(domArtist.children[0].data);
    }

    console.log(artists);
    const artistsStr = artists.join("\r\n");
    fs.writeFileSync("bottlerock_2022_full.txt", artistsStr);
}

run()
