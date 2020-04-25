1. `brew install redis`
2. `redis-server` in separate tab
3. source ./setup_env.sh
4. `npm i`
5. `node dist/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy
    * hardcoded festival for now, change the filename in the code to load other lineup text file
6. `npm start`
7. GET `localhost/health` for healthcheck
8. GET `localhost/festivals`
    * first submission for festival will take some time to load all artists into cache
    * bug where it never loads the last artist in. Restart the server and re-submit and it'll work
?. Might need to run spotifyHelper.reduceSpotifyGenres ? It's run in getArtistById in the same file now, so dunno if separate script was just for testing