const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");

async function run() {
    const url = "https://aftershockfestival.com/lineup";
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    const thursdayArtists = [];
    const fridayArtists = [];
    const saturdayArtists = [];
    const sundayArtists = [];
    let domArtists = $(".filter-thursday").find(".esg-bottom");
    for (const domArtist of domArtists) {
        if (domArtist == undefined) {
            continue;
        }

        thursdayArtists.push(`      - name: ${domArtist.children[0].data}`);
    }

    domArtists = $(".filter-friday").find(".esg-bottom");
    for (const domArtist of domArtists) {
        if (domArtist == undefined) {
            continue;
        }

        fridayArtists.push(`      - name: ${domArtist.children[0].data}`);
    }

    domArtists = $(".filter-saturday").find(".esg-bottom");
    for (const domArtist of domArtists) {
        if (domArtist == undefined) {
            continue;
        }

        saturdayArtists.push(`      - name: ${domArtist.children[0].data}`);
    }

    domArtists = $(".filter-sunday").find(".esg-bottom");
    for (const domArtist of domArtists) {
        if (domArtist == undefined) {
            continue;
        }

        sundayArtists.push(`      - name: ${domArtist.children[0].data}`);
    }

    const filename = "aftershock_2023_full.txt";
    const thursdayArtistsStr = thursdayArtists.join("\r\n");
    const fridayArtistsStr = fridayArtists.join("\r\n");
    const saturdayArtistsStr = saturdayArtists.join("\r\n");
    const sundayArtistsStr = sundayArtists.join("\r\n");

    console.log(`Saving ${thursdayArtists.length} thursday artists`);
    fs.writeFileSync(filename, "THURSDAY\n");
    fs.appendFileSync(filename, thursdayArtistsStr);

    console.log(`Saving ${fridayArtists.length} friday artists`);
    fs.appendFileSync(filename, "\n\nFRIDAY\n");
    fs.appendFileSync(filename, fridayArtistsStr);

    console.log(`Saving ${saturdayArtists.length} saturday artists`);
    fs.appendFileSync(filename, "\n\nSATURDAY\n");
    fs.appendFileSync(filename, saturdayArtistsStr);

    console.log(`Saving ${sundayArtists.length} sunday artists`);
    fs.appendFileSync(filename, "\n\nSUNDAY\n");
    fs.appendFileSync(filename, sundayArtistsStr);
}

run()
