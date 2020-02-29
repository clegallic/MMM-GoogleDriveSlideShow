Module.register("MMM-GoogleDriveSlideShow", {

	defaults: {
		rootFolderId: "root", // Google Drive root folder id, or 'root' for root folder
		maxFolders: 30, // Maximum number of folders to scan
		maxResults: 10, // Maximum of images to load
		playMode: "AUTO", // Mode of play : AUTO (automatic) or NOTIFICATION (only on the notification configured "nextOnNotification")
		nextOnNotification: null,  // Change image when this notification is received
		stopOnNotification: null, // Stop slideshow when this notification is receveived
		startOnNotification: null, // Start slideshow when this notification is received (or next photo if playMode = NOTIFICATION)
		preloadNextOnStop: false, // Special configuration for PIR module, allowing to preload the next image just after the screen is off, to be ready when screen is on
		refreshDriveDelayInSeconds: 24 * 3600, // How often Google Drive cache is refresh (fetch new photos)
		refreshSlideShowIntervalInSeconds: 10, // How often the image on the slideshow is refreshed
		maxWidth: "800",
		theme: "whiteFrame", // Name of CSS class to use for theme : none, insetShadow or whiteFrame
		opacity: 1, // resulting image opacity. Consider reducing this value if you are using this module as a background picture frame
		debug: false, // To display or not debug message in logs
	},

	getStyles: function () {
		return ["MMM-GoogleDriveSlideShow.css"];
	},

	start: function() {
		this.sendSocketNotification("INIT", this.config);
	},

	getDom: function() {
		var wrapperContainer = document.createElement("div");
		wrapperContainer.id = "gDriveSlideShowContainer";
		var imageDiv = document.createElement("div");
		imageDiv.id = "gDriveSlideShow";
		imageDiv.style.backgroundSize = this.config.mode;
		if(this.config.theme != "none") { imageDiv.className = this.config.theme; }
		wrapperContainer.appendChild(imageDiv);
		return wrapperContainer;
	},

	showImage: function(imageInfo) {
		var url = "/MMM-GoogleDriveSlideShow/file/" + imageInfo.id;
		var imageDiv = document.getElementById("gDriveSlideShow");

		imageDiv.style.opacity = 0;

		setTimeout(() => {
			var bgImg = new Image();
			bgImg.onload = function(){
				imageDiv.style.backgroundImage = "unset";
				imageDiv.style.backgroundImage = "url('" + url + "')";
				imageDiv.style.opacity = self.config.opacity;
				var imageWidth = Math.min(imageInfo.imageMediaMetadata.width, self.config.maxWidth);
				imageDiv.style.width = imageWidth + "px";
				imageDiv.style.height = Math.round((imageInfo.imageMediaMetadata.height * imageWidth) / imageInfo.imageMediaMetadata.width)  + "px";;
			};
			bgImg.src = url;
			var self = this;
		}, 2000);

	},

	socketNotificationReceived: function(notification, payload) {
		switch(notification) {
		case "NEW_IMAGE":
			this.showImage(payload);
			break;
		}
	},

	notificationReceived: function(notification, payload, sender) {
		if(this.config.debug){
			Log.info("Notification received :", notification, payload, sender);
		}

		switch(notification) {
		case this.config.nextOnNotification:
			this.sendSocketNotification("REQUEST_NEW_IMAGE", null);
			break;
		case this.config.stopOnNotification:
			this.sendSocketNotification("STOP_SLIDESHOW", null);
			break;
		case this.config.startOnNotification:
			this.sendSocketNotification("START_SLIDESHOW", null);
			break;
		}

	}
});
