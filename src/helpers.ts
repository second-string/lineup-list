import fetch from "node-fetch";
import formUrlEncode from "form-urlencoded";

export function baseSpotifyHeaders(method: string, spotifyToken: string) {
    return {
        method,
        headers: {
            "Content-type": "application/json",
            Authorization: "Bearer " + spotifyToken
        },
        family: 4
    };
}

export async function sleep(ms: number, timeoutValue: any = null) {
    return await new Promise(async (resolve, reject) => await setTimeout(() => resolve(timeoutValue || null), ms));
}

export async function instrumentCall(url: string, options: any, logCurl: boolean) {
    let res;
    let error = null;
    let encodedBody = '';
    let unparsedRes = null;

    // Default value of true
    logCurl = logCurl === undefined ? true : logCurl;

    try {
        if (options.body) {
            switch (options.headers['Content-type']) {
                case 'application/json':
                    encodedBody = JSON.stringify(options.body);
                    break;
                case 'application/x-www-form-urlencoded':
                    encodedBody = formUrlEncode(options.body);
                    break;
                default:
                    throw new Error(`Need to supply a data encoded for ${JSON.stringify(options.body, null, 2)}`);
            }

            options.body = encodedBody;
        }

        let backoff = true;
        while (backoff) {
            unparsedRes = await fetch(url, options);

            if (unparsedRes.status === 429) {
                backoff = true;
                let backoffTime: number = Number(unparsedRes.headers.get('Retry-after'));
                if (!backoffTime || backoffTime === 0) {
                    backoffTime = 1;
                }

                console.log(`Got a 429, backing off for ${backoffTime} seconds`);
                await sleep(backoffTime * 1000);
            } else {
                backoff = false;
            }
        }

        if (unparsedRes && !unparsedRes.ok) {
            error = unparsedRes;
        } else {
            res = await unparsedRes.json();
        }
    } catch (e) {
        error = unparsedRes === null ? {} : unparsedRes;
        throw e;
    } finally {
        // Log out a curl for every call we instrument.
        if (logCurl && process.env.DEPLOY_STAGE !== 'PROD') {
            const curl = ['curl'];

            // -s: don't show progress ascii
            // -D -: output headers to file, '-' uses stdout as file
            // You can also use -v for a full dump
            curl.push('-sD -');
            curl.push(`\'${url}\'`);
            curl.push(`-X ${options.method}`);
            for (const header of Object.keys(options.headers)) {
                curl.push(`-H \'${header}: ${options.headers[header]}\'`);
            }

            if (encodedBody) {
                curl.push(`-d \'${encodedBody}\'`);
            }

            curl.push('--compressed');
            console.log(curl.join(' '));
        }
    }

    const success = error === null;
    const response = error || res;
    return { success, response };
}
