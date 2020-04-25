1. `brew install redis`
2. `redis-server` in separate tab
3. source ./setup_env.sh
4. `npm i`
5. `npm run build`
6. (optional) `node dist/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy
    * hardcoded festival for now, change the filename in the code to load other lineup text file
    * if you don't run it, when you choose a festival the site will automatically get all the artists and load into cache anyway
7. `npm start`
8. GET `localhost/health` for healthcheck
9. GET `localhost/festivals`
    * first submission for festival will take some time to load all artists into cache
    * bug where it never loads the last artist in. Restart the server and re-submit and it'll work
?. Might need to run spotifyHelper.reduceSpotifyGenres ? It's run in getArtistById in the same file now, so dunno if separate script was just for testing
