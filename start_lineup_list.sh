NODE=/usr/bin/node
NPM=/usr/bin/npm

source setup_env.sh
$NPM run build

# Need to eventually rename this file to be plural, but it'll warm cache
# for every supported festival and year listed in the file. As this number
# grows I'll need to make it better since it already 409s and backs off for
# just two.
$NODE dist/warm-cache-for-festival.js
$NPM start
