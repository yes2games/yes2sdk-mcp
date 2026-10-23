import Phaser from "phaser";
import { requireSdk } from "@yes2games/js";

const sdk = requireSdk();
await sdk.initializeAsync();
new Phaser.Game({ type: Phaser.WEBGL, canvas: document.getElementById("game-canvas") as HTMLCanvasElement });
await sdk.startGameAsync();
