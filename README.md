# MMM-GoogleDriveSlideShow
Display your photos from files of Google Drive on MagicMirror

Partially inspired by [MMM-GooglePhotos](https://github.com/eouia/MMM-GooglePhotos/) and [MMM-GoogleBirthdaysProvider](https://github.com/PalatinCoder/MMM-GoogleBirthdaysProvider)

## Screenshot
[[PlaceHolder]]

## Regular installation

1. Install Module
```sh
git clone https://github.com/clegallic/MMM-GoogleDriveSlideShow.git
cd MMM-GoogleDriveSlideShow
npm install
```

### Get `Auth` and `FolderId`
1. Go to [Google API Console](https://console.developers.google.com/)
2. From the menu bar, select a project or create a new project.
3. To open the Google API Library, from the Navigation menu, select `APIs & Services > Library`.
	DOn't forget to enble the Google API Services.
4. Search for "Google Drive API". Select the correct result and click Enable.
5. Then, from the menu, select `APIs & Services > Credentials`.
6. On the Credentials page, click `Create Credentials > OAuth client ID`.
7. Select your Application type as `Other` and submit. (Before or After that, you might be asked for making consent screen. do that.)
8. Then, you can download your credential json file from list. Downloaded file name would be `client_secret_xxxx...xxx.json`. rename it as `credentials.json` and save it to your `MMM-GoogleDriveSlideShow` directory.
9. Now, open your termial(not via SSH, directly in your RPI).
```shell
cd ~/MagicMirror/modules/MMM-GoogleDriveSlideShow
npm run token:generate
```
10. At first execution, It will display a link that will ask you to login google account and to consent your allowance.
11. After consent, some code (`4/ABCD1234xxxx...`) will be appeared. copy it and return to your terminal. paste it for answer of prompt in console.
12. Now you can get list of your Google Drive folders. like these;
```

...
```
13.  now set your `config.js`

## Configuration
```javascript
{
  module: "MMM-GoogleDriveSlideShow",
  position: "bottom_bar",
  config: {
		rootFolderId: "root", // Google Drive root folder id, or 'root' for root folder
		maxFolders: 30, // Maximum number of folders to scan
		maxResults: 10, // Maximum of images to load
		listenToNotification: null,  // Change image only when this notification is received. Automatic refresh otherwise if null
		refreshDriveDelayInSeconds: 24 * 3600, // How often Google Drive cache is refresh (fetch new photos)
		refreshSlideShowIntervalInSeconds: 10, // How often the image on the slideshow is refreshed
		showWidth: "100%", // how large the photo will be shown as.
		showHeight: "100%",
		minWidth: "800px", // how large the photo will be shown as.
		minHeight: "600px",
		opacity: 1, // resulting image opacity. Consider reducing this value if you are using this module as a background picture frame
		mode: "contain", // "cover" or "contain",
		debug: false, // To display or not debug message in logs
  }
},
```

## Last Tested;
- MagicMirror : v2.10.1
- node.js : 8.16.2 & 10.17.0

## Update

## TODO

- Add rootFolderId in cache to compare any change and reset if any
- Explain who to get the folderId in Google Drive
- Add option to display filename, date and parent folder name
- Add option to choose mimetype of files to search
- Detect and correct photo orientation when portait is displayed as landscape
- Allow multiple root folders Ids
- Prevent concurrent reloading of cache
