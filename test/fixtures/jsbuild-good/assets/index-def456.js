// A Vite build with base "./": relative paths, no mock, no SDK copy.
var hero = new Image();
hero.src = new URL("hero.png", import.meta.url).href;
const sdk = window.Yes2SDK;
sdk.initializeAsync().then(() => { sdk.setLoadingProgress(100); return sdk.startGameAsync(); });
