var NodeHelper = require("node_helper");
const {google} = require("googleapis");
const promisify = require("util").promisify;
const fs = require("fs");
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);

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

	broadcastTimer: null,

	start: async function (){

		await this.setupGoogleApiService();

		this.expressApp.use("/" + this.name + "/random", async (req, res, next) => {
			let photoId = await this.getRandomPhoto();
			this.sendSocketNotification("NEW_IMAGE", photoId);
			res.send({
				"random" : photoId,
				"cache" : this.cache.photos,
				"sent" : this.alreadySentPhotoIds
			});
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
			if("random" == photoId){
				photoId = await this.getRandomPhoto();
			}
			this.debug(photoId);
			this.gDriveService.files
				.get({fileId: photoId, alt: "media"}, {responseType: "stream"})
				.then(response => {
					res.writeHead(response.status, response.headers);
					response.data.pipe(res);
				});
		});
	},

	socketNotificationReceived: async function(notification, payload) {
		switch(notification) {
		  case "INIT":
			this.config = payload;
			this.debug("DEBUG IS ACTIVE");
			this.debug(this.config);
			await this.broadcastRandomPhoto();
			if(this.config.listenToNotification == null){
				this.broadcastTimer = setInterval(async () => await this.broadcastRandomPhoto(), this.config.refreshSlideShowIntervalInSeconds * 1000);
			}
			break;
		case "REQUEST_NEW_IMAGE":
			this.broadcastRandomPhoto();
			break;
		}
	},

	broadcastRandomPhoto: async function(){
		let photoId = await this.getRandomPhoto();
		this.sendSocketNotification("NEW_IMAGE", photoId);
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
		let photosId = await this.loadPhotosIds();
		this.cache = {
			created: new Date().getTime(),
			photos: photosId
		};
		await writeFile(`${this.path}/${CACHE_FILE_PATH}`, JSON.stringify(this.cache));
	},

	resetCache: async function(){
		this.cache.created = -1;
		await unlink(`${this.path}/${CACHE_FILE_PATH}`);
	},

	getRandomPhoto: async function(){
		let photos = await this.getPhotos();
		let randomIndex = Math.floor(Math.random() * photos.length);
		let randomPhotoId = photos[randomIndex];
		this.cache.photos.splice(randomIndex,1);
		// If all photos are sent, reload cache from file
		if(this.cache.photos.length === 0){
			await this.loadCache();
			this.alreadySentPhotoIds = [];
		}
		this.alreadySentPhotoIds.push(randomPhotoId);
		return randomPhotoId;
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
			this.cache.photos = await this.cache.photos.filter(photoId => !this.alreadySentPhotoIds.includes(photoId));
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
					fields: "nextPageToken, files(id, name)",
					pageToken: pageToken
				});
				pageToken = response.data.nextPageToken;
				let max = Math.min(limits - results.length, response.data.files.length);
				results = results.concat(response.data.files.splice(0,max).map(entry => entry.id));
				if(max < response.data.files.length) {pageToken = null;}
				this.debug(`${results.length} photos retrieved`);
			} while (pageToken);
			if(results.length === limits) {break;}
		}
		return results;
	},

	loadPhotosIds: async function(){
		let debut = new Date();
		let folderIds = await this.walkFolders(this.config.rootFolderId, this.config.maxFolders).catch(console.error);
		let photosIds = await this.searchPhotos(folderIds, this.config.maxResults);
		this.log((new Date().getTime() - debut.getTime()) / 1000 + " seconds", `${photosIds.length} photos (${folderIds.length} of ${this.config.maxFolders} folders scanned)`);
		return photosIds;
	}
});
