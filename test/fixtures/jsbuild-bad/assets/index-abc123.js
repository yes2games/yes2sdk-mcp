// A Vite build with the default base "/" and an unguarded mock import.
var settingsKey = "yes2sdk-mock-settings";
var hero = new Image();
hero.src = "/assets/hero.png";
window.Yes2SDK.initializeAsync().then(function () { return window.Yes2SDK.startGameAsync(); });
