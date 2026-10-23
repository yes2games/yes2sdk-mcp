// Bundled game that integrates the Yes2SDK. The dashboard injects the SDK;
// the game's own code calls window.Yes2SDK, which is what detectSDKIntegration() looks for.
window.Yes2SDK.initializeAsync().then(function () {
  return window.Yes2SDK.startGameAsync();
});
