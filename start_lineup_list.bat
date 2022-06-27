# set appropriately if not in your %PATH%
set NODE=node
set NPM=npm

call setup_env.bat
%NPM% run build

# Need to eventually rename this file to be plural, but it'll warm cache
# for every supported festival and year listed in the file. As this number
# grows I'll need to make it better since it already 409s and backs off for
# just two.
#%NODE% dist\warm-cache-for-festival.js
%NPM% start
