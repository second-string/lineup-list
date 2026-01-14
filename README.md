# Lineup List

## Info
[![Website https://lineuplist.live](https://img.shields.io/website-up-down-green-red/http/shields.io.svg)](https://lineuplist.live)
[![GitHub license](https://badgen.net/github/license/dot4qu/lineup-list)](https://github.com/dot4qu/lineup-list/blob/master/LICENSE)

[lineuplist.live](https://lineuplist.live)  

A Spotify playlist generator for music festival lineups. Choose from different filters and playlist options to customize it to your tastes. See the [FAQ](views/faq.handlebars) for more information.


## Development
### Local environment

#### If you've set up and run before:
1. `./start_lineup_list.sh` / `./start_lineup_list.bat`
2. Navigate to `https://localhost` in your browser, or `http://localhost:8080` if the LINEUPLIST_FORCE_HTTP env var is set to true


- GET `localhost/health` for healthcheck

#### If you're setting up for the first time:

##### Setting up necessary environment variables

To run the server locally with full functionality, there are 5 environment variables you'll need. 
1. CLIENT_ID - this is the developer client ID for accessing Spotify's API  
    - Sign into [developer.spotify.com](https://developer.spotify.com) with your regular Spotify account and navigate to the Dashboard page  
    - Click "Create an App" and fill in whatever info you want for the details, it doesn't matter    - When that app's page loads, there is a `Client ID` available underneath the app name and description, use this as the value of the CLIENT_ID env var  
    - Spotify require you to set the auth callback URL. Click `Edit Settings` and add the following to the Redirect URI section: `https://localhost/spotify-auth-callback`
2. CLIENT_SECRET - the developer client secret for the above Spotify client ID  
    - Navigate to the app you created above, then click the link that says `Show client secret`  
    - Use this as the value for the CLIENT_SECRET env var  
3. DEPLOY_STAGE - this is used internally for switching between production and development logic  
    - Set this to `DEV`  
4. SETLIST_FM_API_KEY - the API key for accessing the setlist FM API  
    - If you are not in PROD and have no intention of using the "Recent setlists" track type, you can leave this empty and API calls won't be made  
    - Create a setlist.fm regular account  
    - Navigate to their [apps page](https://www.setlist.fm/settings/apps) and apply for an API key  
    - Once they approve (pretty quick turnaround) use the API key shown on the apps page as the value for SETLIST_FM_API_KEY  
5. LINEUPLIST_FORCE_HTTP - bypass https locally to avoid having to generate self-signed certs  
    - Set this to true if you don't want to muck about with creating a pair of self-signed cert + key locally (it's not unduly difficult, ~15 minutes if you follow directions found online)  
    - There might be some degraded functionality around the step of actually generating a playlist where we redirect to Spotify's login and then send you back. Create an issue if you find this is the case  

I like to add all of these to an .sh script that I can source before starting the server.
For example: `source setup_env.sh` where setup_env.sh looks like:
``` sh
#!/bin/bash
# Must `source ./setup_env.sh`, running it normally execs in a new shell

echo -n "Setting spotify client ID... "
export CLIENT_ID=client-id-no-quotes
echo "done."
echo -n "Setting spotify client secret... "
export CLIENT_SECRET=client-secret-no-quotes
echo "done."
echo -n "Setting deploy stage (DEV)... "
export DEPLOY_STAGE=DEV
echo "done."
echo -n "Setting setlist.fm API key..."
export SETLIST_FM_API_KEY=setlist-fm-key-no-quotes
echo "done."
echo -n "Setting FORCE_HTTP to false to use self-signed local certs..."
export LINEUPLIST_FORCE_HTTP=true-or-false-no-quotes
echo "done."
```

For Windows, assuming using cmd.exe remove the `-n` and double quotes from the `echo` lines, and replace `export` with `set`.

##### macOS build system
1. `brew install redis npm`
2. `redis-server` in separate tab
3. set necessary env vars (see section above)
4. `npm i`
5. `npm run build`
6. `node dist/src/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy but has been working
    * handles pulling in artist info  for all supported festival
7. `npm start`
8. Navigate to `https://localhost` in your browser (or `http://localhost:8080` if LINEUPLIST_FORCE_HTTP is set to true)

##### Windows build system
1. Install both redis and npm either through a package manager like Chocolatey or directly from their source installers
2. `redis-server` in separate tab
3. set necessary env vars (see section above)
4. `npm i`
5. `npm run build`
6. `node dist/src/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy but has been working
    * handles pulling in artist info  for all supported festival
7. `npm start`
8. Navigate to `https://localhost` in your browser (or `http://localhost:8080` if LINEUPLIST_FORCE_HTTP is set to true)


### Festival lineup files

Two file formats are supported - text and YAML. Both are described below. The YAML format is more complex, but offers additonal functionality over the text format.

IF both a text and YAML file are present for a festival/year combo, the YAML file will take priority and the text file will be ignored.


### Festival text file format

If the festival has daily lineups released:
- One artist on each line, followed by a comma, then the day they are performing
- Days start at 1 for the first day of the festival
- It's often more readable to differentiate days with a newline between the last artist of a previous day and the first artist of the next day. That's fine, the script ignores newlines

If the festival only has the full lineup released with no day lineups:
- One artist on each line, no commas, no numbers


### Festival YAML file format

For convenience, a sample YAML file is shown below. The YAML file format supports some additional features over the text file format, though most are not yet implemented. 
As of August 2022 the only utilised feature is the ability to specify a Spotify Artist URI, to allow the loader script to lookup the exact artist rather than search by name.
The festival fields do not overwrite the values currently hardcoded in the application, but are required and may support dynamic loading of festivals in future.

```
display_name: All Points East
slug: allpointseast
region: eu
year: 2022
days:
  - number: 1
    date: 19-Aug-22
    display_name: Weekend 1
    artists:
      - name: The Chemical Brothers
        spotify_uri: 1GhPHrq36VKCY3ucVaZCfo
      - name: The Strokes
  - number: 2
...
```

The above example shows a festival with multiple days. If the festival only has the full lineup released with no day lineups, simply add all artists under a single day with `number: 0`.

YAML files are validated against a schema at load, defined in `lineup-schema.json`. Any error will cause the load process to exit.

Note that is an artist name (or any other string) contains a colon (:), the value will needed to be enclosed in double-quotes to avoid breaking the YAML format.


### Adding a new festival
1. Add a text file in the form of `[simplename]_[year].txt` or `[simplename]_[year].yaml`  in the lineups/ folder. Note that extensions are case-sensitive on some OSes.
2. Add support for the festival within src/constants.ts following the example of the others
3. Build ts files with `npm run build`
4. Run `node dist/src/warm-cache-for-festival.js [simplename] [year]`
> The following steps are optional but encouraged if you're set up to run the code locally yourself. It saves me time and will get your PR merged and deployed much faster if you can provide evidence of the below steps.
5. Verify that for each day of the festival, the line `X == Y` in each line that prints `Received X artists from Y lineup artist`.
> If it does not, edit the artist names right above it that are printed in the `No artist found for search term <lineup artist>`. Common fixes here are splitting two DJ artists that are on one line going B2B, removing `Live` or `(Live)` from the end of artists, or sometimes just removing an artist entirely if you manually search them on Spotify and they don't appear.
6. Verify that there are no obvious error printouts in the output. These will be very clear as a node.js exception spewing a lot of information. Simply rerun the script if these are encountered. 404s from setlist.fm or the musicbrainz API are totally fine, the script falls back to other forms of tracks.
7. After the above step is successful, re-run the same command. Verify that every artist is found in the cache and the script completes instantly.
> There's one edge case to this - when getting newest songs from an artists albums, if the artist only has albums labelled as 'compilation's we don't persist the list of new tracks successfully. So you might see one or two artists on the re-run that have to retrieve newest songs again - there should be maximum 2, MAYBE 3 of these in a lineup. Often it's zero.

For example:
If you're adding a festival with a long name or name with spaces like Electric Zoo, your text file would be `electriczoo_2021.txt`. It may not have an underscore anywhere besides between name and year. For abbreviate-able festivals you can also use their shortened terms: `ezoo_2021.txt`. That would be filename and the name of the festival within the code. The option for a `display_name` in the code is where you put the pretty version, `Electric Zoo`.
If you're running the code locally and want to test and verify once the artists and option day info is in the text file and you've added the proper support in the code, you would run `npm run build`, then `node dist/src/warm-cache-for-festival.js ezoo 2021`. Monitor this output for any errors, but often you can let it run in the background and take a scroll back when it's finished. It takes anywhere from 1 to 15 minutes depending on number of artists on the lineup and how many have been previously saved to your local redis cache from other lineups.
Create a PR with your changes and include any testing you've performed.

### Testing an added festival
Perform these steps if you've added a lineup and want to verify that all artists and data is retrieved properly. Assumes you've followed every step in the 'Adding a new festival' section above and have your environment set up to run the code locally.
1. Run `npm run dev` to run Lineup List locally, then navigate to the proper localhost URL in the browser depending on if you're running HTTP-only or normally
2. Verify that your festival is listed in the dropdown in the correct region section and select it
3. Verify that the correct supported year(s) are shown in the years dropdown then click Submit
4. If the festival has days available to filter, verify that they're continous ascending numbers from 1 (if an artist has a comma in it's name in the lineup text file, it will break the days filter)
5. If the festival has days available to filter, uncheck then recheck each day, verifying that a chunk of artists in the proper area of the artist list disappears and reappers (i.e. day one should remove a lot of artists starting from the beginning, day 2 should be somewhere in the middle, day 3 at the end or you can't see any change because the bottom of the list is offscreen)
6. If the festival has days available to filter, uncheck all days and verify that every artist disappears (added due to a now-fixed bug where an artist that played multiple days wouldn't filter off completely)
7. Uncheck the 'Check/Uncheck all main genres' checkmark and verify a large opacity change in the artist, probably with some artists disappearing, then recheck it
8. With every day, genre, and artist checked, switch the Track Type to Recent Setlists and increase tracks per artist to 6 or 7, then click Generate
9. Verify that the customized lineup page loads very quickly (within 1, maybe 2 seconds)
10. Verify in the terminal output that no new artist info was fetched and it was all retrieved from the redis cache (with the exception of the edge case explained after step 8 in the 'Adding a new festival' section)
11. Verify that the first few artist have the same amount of tracks as selected on the previous screen
12. Verify that these tracks look a bit different than just the artist's most popular songs to make sure they were properly fetched from setlists (for artists without setlists, we fallback to the top songs, so if there's an artist here or there that just has their top songs that's fine. Most headliners should always be able to find setlist songs though)
13. Click Generate Playlist, and verify the playlist appears in your Spotify library. If running code in HTTP-only mode this will fail, that's okay. It's a low-risk failure point of the process, and doesn't need to be tested that often.

### Transitioning an existing festival to one with daily lineups
1. Alter festival text file and add days after each artist in accordance with the `Adding a new festival` section
2. `redis-server` if not already running
3. `redis-cli get "festival:[simplename]_[year]:days"` and verify that the output is a stringified list of a single `0` value
4. `redis-cli del "festival:[simplename]_[year]:days"`
5. `redis-cli --scan --patern "festival:[simplename]_[year]:*"` and verify that the output is a single item ending in `:0`
6. `redis-cli del "festival:[simplename]_[year]:0"`
7. Rerun `node dist/src/warm-cache-for-festival.js [simplename] [year]` to populate days metadata
> Note: If you're getting a ton of 400s and failures running warm-cache-for-festival.js, make sure you have the spotify token set as an env variable correctly

### Updating the artist list of an existing festival
More and more festivals are doing large shuffles of artists after their lineup is released but before the festival. If a lineup on the site is out of date, these are the only steps needed to update it.
1. Edit the lineup text file, adding and removing any artists to match the new lineup
2. Rerun `node dist/src/warm-cache-for-festival.js [simplename] [year]` to overwite metadata and fetch info for new artists
