const needle = require('needle'); // requires library to make HTTP requests
const fs = require('fs'); // requires library to save files
const token = "AAAAAAAAAAAAAAAAAAAAAKyaNgEAAAAAnu7gpW%2BtRtNA7gCghIDi5Dh4Mlc%3D5EQoWrgxGvW3pttkuqHe7uSxNySmXTHEJE3etJF4keLahwe1bq"; // this is your bearer token

const endpointUrl = "https://api.twitter.com/2/tweets/search/recent"; // End-point for recent search
//const endpointUrl = "https://api.twitter.com/2/tweets/search/all"; // This would be the end-point for the full historical search, only available for academic licenses


/** This function simply puts a request given a certain 'query'
*  and a batch of paginated results indicated in 'nextToken' */

async function getRequest(query, nextToken) {

	// builds a query object to send
	function buildQuery() {
		let q = {
			"query": query,     // the query
			"max_results": 100, // max results per request, 100 is the maximum for standard licenses in sandboxed environments
			"expansions": "geo.place_id,attachments.media_keys",   // whenever a tweet has geographical information in the form a of place_id, get more info on that place_id
			"tweet.fields": "author_id,created_at,geo",     // by default the Tweet id and and the text are returned, but here we're also including the author_id, the time of publishing, and its geographical features
			"place.fields": "geo,name,full_name,place_type", // the additional information associated with a place_id, namely its name and a geo object with geographical coordinates, either in the form of a point or a bounding box
			"media.fields": "preview_image_url,url"
		};
		// the nextToken paramenter is optional (as there is none in the first request
		// but if a nextToken was passed, then it inserts it into the query object
		if (nextToken !== undefined) q["next_token"] = nextToken;
		return q;
	}

	const response = await needle('get', endpointUrl, buildQuery(), {
		headers: {
			"User-Agent": "v2RecentSearchJS",   // Can be whatver you want
			"authorization": "Bearer " + token    // Attaches your Bearer token to the header of the request
		}
	})
	return response.body;   // Returns the contents of the response
}


/** async funtions enable us to stop the program to wait on requests
*  this function is the core of the program and where execution starts */

(async function () {

	/** an anonymous function that gets a whole batch of tweet reponses
	*  and only adds the ones with geo information to 'array' */
	function filterTweets(array, batch) {
		batch.data.forEach(tweet => {
			if (tweet["geo"] !== undefined) {
				/* expands place_id */
				if (tweet.geo["place_id"] !== undefined) {
					/* associates the place_id with the expanded information on place_ids in the response */
					let expanded_geo = batch.includes.places.find(place => {
						return place.id == tweet.geo.place_id;
					});
					// adds new variable to tweet object called 'place_info'
					tweet.place_info = expanded_geo;
				}
				if (tweet['place_info']['geo']['bbox'] !== undefined) {
					//average of the bbox
					/*
					bbox[0] -> x of bottom left corner
					bbox[1] -> y of bottom left corner
					bbox[2] -> x of top right corner
					bbox[3] -> y of top right corner
	
					*/

					let xa = (tweet.place_info.geo.bbox[0] + tweet.place_info.geo.bbox[2]) / 2
					let ya = (tweet.place_info.geo.bbox[1] + tweet.place_info.geo.bbox[3]) / 2

					tweet.place_info.geo.center = [xa, ya];
				}

				if (tweet.attachments !== undefined) {
					// if (tweet.attachments['media_keys'] !== undefined) {
					let mediaKey = tweet.attachments.media_keys[0];
					/* associates the media_keys with the expanded information in the response */
					let relevantMedia = batch.includes.media.find(mediaEntry => {
						return mediaEntry.media_key == mediaKey
					});

					// adds new variable to tweet object called 'media_url'
					if (relevantMedia.type == 'photo') {
						tweet.media_url = relevantMedia.url;
					}
					else if (relevantMedia.type == 'video') {
						tweet.media_url = relevantMedia.preview_image_url;
					}
				}

				array.push(tweet);
			}
		});
	}

	let filteredTweets = []; //array to keep all collected tweets

	const query = "animaisselvagens -is:retweet";       // we are searching for the word 'wildlife' but only in tweets that are *not* retweets since retweets never have geo information
	let response = await getRequest(query); // finally, put the request and wait for the response
	//console.log(response); // DEBUG
	const nGeoTweets = 200;     // after how many collected tweets with geo info are stopping execution (in this example: 500)>
	while (response.meta["next_token"] !== undefined) {
		response = await getRequest(query, response.meta.next_token);
		filterTweets(filteredTweets, response);
		console.log(filteredTweets.length); // DEBUG
		await sleep(2100);  /*  sleeps the program for 2.1seconds : 
					the standard rate limit is 450 requests per 15 min time period.
					If you make more than 450 requests in less than 15 mins, the API
					will block further requests until the 15 mins period is over;
					Since the percentage of tweets with geo information is low you will 
					need to place more than 450 requets (remember that each requests returns 100 tweets)
					In order to stay under the rate limit and leave the program executing in the
					background collecting tweets, only one request every 2 seconds should be placed */

		//  if we have enough tweets, stops collecting                        
		if (filteredTweets.length >= nGeoTweets) break;
	}

	console.log("TWEETS WITH GEO: " + filteredTweets.length); // DEBUG
	console.log(JSON.stringify(filteredTweets)); // DEBUG
	fs.writeFileSync("Portuguese-hashtag-with-media.json", JSON.stringify(filteredTweets)); // Save the results to a file in the disk
	process.exit(); // terminates the program

})();

/** Utility function that sleeps the program for 'ms' milliseconds */
function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}