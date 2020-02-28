var NodeHelper = require("node_helper");
const {google} = require("googleapis");
const promisify = require("util").promisify;
const fs = require("fs");
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const https = require("https");

const CACHE_FILE_PATH = ".cache";
const G_CREDENTIALS_FILE_PATH = "./secrets/credentials.json";
const G_TOKEN_FILE_PATH = "./secrets/token.json";

module.exports = NodeHelper.create({

	config: {
		rootFolderId: "root",
		maxFolders: 30,
		maxResults: 10,
		refreshDriveDelayInSeconds: 24 * 3600,
		refreshSlideShowIntervalInSeconds: 10,
		debug: false
	},

	alreadySentPhotoIds: [], // Array of images already sent to the MM
	cache: {
		created: null,
		photos: []
	},

	gDriveService: null, // Google Drive API Service

	broadcastTimer: null, // Timer for next image broadcast

	lastBroadcastDate: new Date(),

	start: async function (){

		await this.setupGoogleApiService();

		this.expressApp.use("/" + this.name + "/next", async (req, res, next) => {
			await this.broadcastRandomPhoto();
			res.send("Next photo requested");
		});

		this.expressApp.use("/" + this.name + "/stop", async (req, res, next) => {
			await this.stopSlideShow();
			res.send("Slideshow stopped");
		});

		this.expressApp.use("/" + this.name + "/play", async (req, res, next) => {
			this.startSlideShow();
			res.send("Slideshow started");
		});

		this.expressApp.use("/" + this.name + "/cache/reset", async (req, res, next) => {
			await this.resetCache();
			await this.getPhotos();
			res.send({
				cache : this.cache,
			});
		});

		this.expressApp.use("/" + this.name + "/file/:photoId", async (req, res, next) => {
			let photoId = req.params.photoId;
			if("random" === photoId){
				photo = await this.getRandomPhoto();
				photoId = photo.id;
			}
			this.debug("Displaying photo with ID " + photoId);
			var response = await this.gDriveService.files.get({fileId: photoId, fields: "thumbnailLink"});
			var thumbnailLink = response.data.thumbnailLink.replace("=s220","=s" + this.config.minWidth.replace("px",""));
			var proxy = https.request(thumbnailLink, function (proxyRes) {
				res.writeHead(proxyRes.statusCode, proxyRes.headers);
				proxyRes.pipe(res, {
					end: true
				});
			});
			req.pipe(proxy, {
				end: true
			});

		});
	},

	socketNotificationReceived: async function(notification, payload) {
		this.debug("New notification received : " + notification);
		switch(notification) {
		case "INIT":
			this.config = payload;
			this.debug("DEBUG IS ACTIVE");
			this.debug(this.config);
			await this.startSlideShow(true);
			break;
		case "REQUEST_NEW_IMAGE":
			this.broadcastRandomPhoto();
			break;
		case "STOP_SLIDESHOW":
			this.stopSlideShow();
			break;
		case "START_SLIDESHOW":
			await this.startSlideShow();
			break;
		}
	},

	startSlideShow: async function(firstLaunch){
		this.debug("Starting slideshow. First time ? " + (firstLaunch === true));
		if(!this.config.preloadNextOnStop || firstLaunch){
			this.broadcastRandomPhoto();
		}
		if(this.config.playMode === "AUTO"){
			this.broadcastTimer = setInterval(async () => await this.broadcastRandomPhoto(), this.config.refreshSlideShowIntervalInSeconds * 1000);
		}
	},

	stopSlideShow: function(){
		this.debug("Slidshow stopped");
		clearInterval(this.broadcastTimer);
		if(this.config.preloadNextOnStop){
			this.broadcastRandomPhoto();
		}
	},

	broadcastNewPhoto: async function(photo){
		this.sendSocketNotification("NEW_IMAGE", photo.id);
	},

	broadcastRandomPhoto: async function(){
		if(new Date().getTime() - this.lastBroadcastDate.getTime() > 5000){ // Prevent two notifications to request image change to quickly (5 s mini between each)
			let photo = await this.getRandomPhoto();
			await this.broadcastNewPhoto(photo);
			this.lastBroadcastDate = new Date();
		} else {
			this.debug("Throttle detected, skip new image request");
		}
	},

	setupGoogleApiService: async function(){
		let authDetails = await this.readAuthenticationFiles();
		// eslint-disable-next-line camelcase
		const { client_secret, client_id, redirect_uris } = authDetails.credentials.installed;
		const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
		oauth2Client.setCredentials(authDetails.token);
		this.gDriveService = google.drive({version: "v3", auth: oauth2Client});
	},

	log: function(message){
		console.log(`${this.name} : ${message}`);
	},

	debug: function(message){
		if(this.config.debug){
			this.log(`[DEBUG] ${message}`);
		}
	},

	readAuthenticationFiles: function() {
		return new Promise((resolve, reject) => {
			Promise.all([
				readFile(`${this.path}/${G_CREDENTIALS_FILE_PATH}`),
				readFile(`${this.path}/${G_TOKEN_FILE_PATH}`)
			]).then(values => {
				var credentials = JSON.parse(values[0]);
				var token = JSON.parse(values[1]);
				resolve({credentials, token});
			}).catch(reason => {
				reject(reason);
			});
		});
	},

	cacheFileExists: function(){
		return fs.existsSync(`${this.path}/${CACHE_FILE_PATH}`);
	},

	loadCache: async function(){
		let content = await readFile(`${this.path}/${CACHE_FILE_PATH}`);
		this.cache = JSON.parse(content);
	},

	createCache: async function(){
		let photos = await this.loadPhotos();
		this.cache = {
			created: new Date().getTime(),
			photos: photos
		};
		await writeFile(`${this.path}/${CACHE_FILE_PATH}`, JSON.stringify(this.cache));
	},

	resetCache: async function(){
		this.cache.created = -1;
		await unlink(`${this.path}/${CACHE_FILE_PATH}`);
	},

	buildPhotoUrl: function(photo){
		return photo.thumbnailLink.replace("=s200", "=s" + this.config.minWidth.replace("px",""));
		//return photo.thumbnailLink;
	},

	getRandomPhoto: async function(){
		let photos = await this.getPhotos();
		let randomIndex = Math.floor(Math.random() * photos.length);
		let randomPhoto = photos[randomIndex];
		this.cache.photos.splice(randomIndex,1);
		// If all photos are sent, reload cache from file
		if(this.cache.photos.length === 0){
			await this.loadCache();
			this.alreadySentPhotoIds = [];
		}
		this.alreadySentPhotoIds.push(randomPhoto.id);
		return randomPhoto;
	},

	getPhotos: async function() {

		// Get cache if not already loaded and cache file exists (after a restart for example)
		if(!this.cache.created && this.cacheFileExists()){
			this.log("No memory cache, loading it from disk");
			await this.loadCache();
		}

		// Check if need reload
		let needReload = !this.cache || (new Date().getTime() - this.cache.created) / 1000 > this.config.refreshDriveDelayInSeconds;

		// (re)create the cache if missing or expired
		if(needReload){
			this.log("No cache file, or expired, (re)creating it...");
			await this.createCache();
			this.cache.photos = await this.cache.photos.filter(photo=> !this.alreadySentPhotoIds.includes(photo.id));
		}

		return this.cache.photos;
	},

	walkFolders: async function(folderId, limits, alreadyWalked){

		var folders = [];
		folders.push(folderId);

		// Store already analyzed folders
		if(!alreadyWalked) {
			alreadyWalked = [];
		}
		if(alreadyWalked.length > limits) {return folders;}

		// Add current folder
		alreadyWalked.push(folderId);

		// Query API
		const response = await this.gDriveService.files.list({
			q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder'`,
			pageSize: 100
		});
		if(response.data.files.length){
			let subFolders = alreadyWalked.length + response.data.files.length < limits
				? response.data.files : response.data.files.slice(0, limits - alreadyWalked.length);
			for(var entry of subFolders){
				if(alreadyWalked.indexOf(entry.id) === -1) {
					var rec = await this.walkFolders(entry.id, limits, alreadyWalked);
					folders = folders.concat(rec);
				}
			};
		}

		if(alreadyWalked.length % 10 === 0) {this.debug(`${alreadyWalked.length} folders found`);}
		return folders;
	},

	searchPhotos: async function(folderIds, limits){

		let results = [];
		const maxFoldersPerQuery = 10;
		let iterations = folderIds.length / maxFoldersPerQuery;

		for(let i = 0; i < iterations; i ++){
			this.debug(`Query for photos : iteration ${i + 1}`);
			let range = folderIds.slice(i * maxFoldersPerQuery, (i + 1) * maxFoldersPerQuery);
			let parentsQuery = range.map(folderId => `'${folderId}' in parents`).join(" or ");
			let pageToken;
			do {
				const response = await this.gDriveService.files.list({
					q: `(${parentsQuery}) and mimeType = 'image/jpeg'`,
					fields: "nextPageToken,  files(id,name,parents,thumbnailLink)",
					pageToken: pageToken
				});
				pageToken = response.data.nextPageToken;
				let max = Math.min(limits - results.length, response.data.files.length);
				results = results.concat(response.data.files.splice(0,max));
				if(max < response.data.files.length) {pageToken = null;}
				this.debug(`${results.length} photos retrieved`);
			} while (pageToken);
			if(results.length === limits) {break;}
		}
		return results;
	},

	loadPhotos: async function(){
		let debut = new Date();
		let folderIds = await this.walkFolders(this.config.rootFolderId, this.config.maxFolders).catch(console.error);
		let photos = await this.searchPhotos(folderIds, this.config.maxResults);
		this.log((new Date().getTime() - debut.getTime()) / 1000 + " seconds", `${photos.length} photos (${folderIds.length} of ${this.config.maxFolders} folders scanned)`);
		return photos;
	}
});
