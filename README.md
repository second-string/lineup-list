### If you're setting up for the first time:
1. `brew install redis`
2. `redis-server` in separate tab
3. set necessary env vars
4. `npm i`
5. `npm run build`
6. `node dist/warm-cache-for-festival.js`
    * might need to run it twice if it hangs, it's kinda sketchy but has been working
    * handles pulling in artist info  for all supported festival
7. `npm start`

### If you've set up and run before:
1. `./start_lineup_list.sh`

- GET `localhost/health` for healthcheck
- GET `localhost/festivals`
  * first submission for festival will take some time to load all artists into cache
  * bug where it never loads the last artist in. Restart the server and re-submit and it'll work
