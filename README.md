# Lineup List
[lineuplist.live](https://lineuplist.live)  
A Spotify playlist generator for music festival lineups. Choose from different filters and playlist options to customize it to your tastes. See the [FAQ](views/faq.handlebars) for more information.


## Running Lineup List locally (not necesary unless you're doing local development)
### If you're setting up for the first time:
### Setting up necessary environment variables
To run the server locally with full functionality, there are 5 environment variables you'll need.1. CLIENT_ID - this is the developer client ID for accessing Spotify's API
    - Sign into [developer.spotify.com](https://developer.spotify.com) with your regular Spotify account and navigate to the Dashboard page
    - Click "Create an App" and fill in whatever info you want for the details, it doesn't matter    - When that app's page loads, there is a `Client ID` available underneath the app name and description, use this as the value of the CLIENT_ID env var
2. CLIENT_SECRET - the developer client secret for the above Spotify client ID
    - Navigate to the app you created above, then click the link that says `Show client secret`
    - Use this as the value for the CLIENT_SECRET env var
3. DEPLOY_STAGE - this is used internally for switching between production and development logic
    - Set this to `DEV`
4. SETLIST_FM_API_KEY - the API key for accessing the setlist FM API
    - If you have no intention of using the "Recent setlists" track type, you can set this to any trash value, as long as it's set, and you don't need to create a setlist dev account
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


#### macOS
1. `brew install redis npm`
2. `redis-server` in separate tab
3. set necessary env vars (see section above)
4. `npm i`
5. `npm run build`
6. `node dist/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy but has been working
    * handles pulling in artist info  for all supported festival
7. `npm start`
8. Navigate to `https://localhost` in your browser (or just `http` if LINEUPLIST_FORCE_HTTP is set to true)

### If you've set up and run before:
1. `./start_lineup_list.sh`
2. Navigate to `https://localhost` in your browser (or just `http` if LINEUPLIST_FORCE_HTTP is set to true)


- GET `localhost/health` for healthcheck
- GET `localhost/festivals`
  * first submission for festival will take some time to load all artists into cache
  * bug where it never loads the last artist in. Restart the server and re-submit and it'll work

### Festival text file format
If the festival has daily lineups released:
- One artist on each line, followed by a comma, then the day they are performing
- Days start at 1 for the first day of the festival
- It's often more readable to differentiate days with a newline between the last artist of a previous day and the first artist of the next day. That's fine, the script ignores newlines

If the festival only has the full lineup released with no day lineups:
- One artist on each line, no commas, no numbers

### Adding a new festival
1. Add a text file in the form of `[simplename]_[year].txt` in the root of the repo
2. Add support for the festival within src/warm-cache-for-festival.ts following the example of the others
3. Add support for the festival within src/pages.ts following the example of the others
4. Build ts files with `npm run build`
5. Run `node dist/warm-cache-for-festival.js [simplename] [year]`

For example:
If you're adding a festival with a long name or name with spaces like Electric Zoo, your text file would be `electriczoo_2021.txt`. It may not have an underscore anywhere besides between name and year. For abbreviate-able festivals you can also use their shortened terms: `ezoo_2021.txt`. That would be filename and the name of the festival within the code. The option for a `display_name` in the code is where you put the pretty version, `Electric Zoo`.

### Transitioning an existing festival to one with daily lineups
1. Alter festival text file and add days after each artist in accordance with the `Adding a new festival` section
2. `redis-server` if not already running
3. `redis-cli get "festival:[simplename]_[year]:days"` and verify that the output is a stringified list of a single `0` value
4. `redis-cli del "festival:[simplename]_[year]:days"`
5. `redis-cli --scan --patern "festival:[simplename]_[year]:*"` and verify that the output is a single item ending in `:0`
6. `redis-cli del "festival:[simplename]_[year]:0"`
7. Rerun `node dist/warm-cache-for-festival.js [simplename] [year]` to populate days metadata
> Note: If you're getting a ton of 400s and failures running warm-cache-for-festival.js, make sure you have the spotify token set as an env variable correctly
