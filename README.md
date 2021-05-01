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
