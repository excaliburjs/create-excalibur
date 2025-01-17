import { createNewGame } from "./flows/create-new-game.js";
import { inspectGame } from "./flows/inspect-game.js";
import { createSample } from "./flows/create-sample.js";
export const FLOW_CHOICES = [
  {
    name: "Create a game",
    value: "create",
    // description: "[ Start a new project ]",
  },
  {
    name: "Create a sample project",
    value: "sample",
    // description: "[ Start a new project ]",
  },
  {
    name: "Inspect a game",
    value: "inspect",
    // description: "[ Check games already build with Excalibur ]",
  },
];
export const FLOWS = {
  create: createNewGame,
  sample: createSample,
  inspect: inspectGame,
};
export const TEMPLATES = [
  {
    name: "Typescript with Vite",
    value: "typescript_vite",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-vite.git",
    startCommand: "npm run dev",
  },
  {
    name: "Typescript with Parcel",
    value: "typescript_parcel",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-parcel-v2.git",
    startCommand: "npm run start",
  },
  {
    name: "Typescript with Rollup",
    value: "typescript_rollup",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-rollup.git",
    startCommand: "npm run start",
  },
  {
    name: "Vanilla JavaScript 😎",
    value: "javascript_vanilla",
    description: "",
    repo: "https://github.com/excaliburjs/template-vanilla-js.git",
    startCommand: "npm run start",
  },
  {
    name: "Typescript with Webpack",
    value: "typescript_webpack",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-webpack.git",
    startCommand: "npm run dev",
  },
  {
    name: "TypeScript with Tauri 2.0 (Desktop + Mobile)",
    value: "javascript_tauri_2",
    description: "",
    repo: "https://github.com/excaliburjs/template-tauri-v2",
    startCommand: "npm run start",
  },
  {
    name: "TypeScript with Tauri 1.0 (Desktop)",
    value: "javascript_tauri_1",
    description: "",
    repo: "https://github.com/excaliburjs/template-tauri",
    startCommand: "npm run start",
  },
  {
    name: "TypeScript with Capacitor.js (Mobile)",
    value: "javascript_capacitorjs",
    description: "",
    repo: "https://github.com/excaliburjs/template-capacitorjs",
    startCommand: "npm run start",
  },
  {
    name: "TypeScript with Electron",
    value: "javascript_electron",
    description: "",
    repo: "https://github.com/excaliburjs/template-electron.git",
    startCommand: "npm run start",
  },
  {
    name: "Typescript with Browserify",
    value: "javascript_browserify",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-browserify.git",
    startCommand: "npm run all",
  }
];
export const SHOWCASES = [
  {
    title: "Excali-Farm",
    value: "Excali-Farm",

    description:
      "A little farming game created with the Excalibur Tiled plugin. Come and enjoy the supremely cozy vibes on this lovely farm.",
    url: "https://excali-farm.netlify.app/",
    source: "https://github.com/mahbarahona/tiles",
  },
  {
    title: "Retro Ski",
    value: "Retro Ski",

    description:
      "Put your skis and let's race some randomly generated alpine ski tracks with your friends.",
    url: "https://une-entreprise.ch/retroski/",
    source: "https://github.com/mathieuher/RetroSki",
  },
  {
    title: "Night Bike",
    value: "Night Bike",

    description:
      "Ride your motorcycle through the city at night! Jump over as many vehicles as you can!",
    url: "https://nightbike.mattjennin.gs/",
    source: "https://github.com/mattjennings/nightbike",
  },
  {
    title: "Super Metronome Hero",
    value: "Super Metronome Hero",

    description:
      "Super Metronome Hero is a rhythm game. Rather than trying to make a game I wanted to play out of this rather popular genre I decided to send it up with this nonsense joke game.",
    url: "https://super-metronome-hero.vidja.games/",
    source: "https://github.com/dcgw/super-metronome-hero",
  },
  {
    title: "Sword Adventure",
    value: "Sword Adventure",

    description:
      "This game is an easily customizable template for developing an Excalibur game with Ionic React, the XState library, i18next, Twine integration for dynamic dialogs, and CapacitorJS. It comes with scene transitions, data persistence and tutorials included!",
    url: "https://nicastro.in/excalibur-games/sword-adventure",
    source: "https://github.com/facondiaGames/sword-adventure",
  },
  {
    title: "Beach Breach",
    value: "Beach Breach",

    description:
      "This game was created for Ludum Dare 50. Defend your sandcastle from crabs, turtles, and seagulls in this beach-themed tower defense game!",
    url: "http://excaliburjs.com/ludum-50/",
    source: "https://github.com/excaliburjs/ludum-50",
  },
  {
    title: "Meerkattica",
    value: "Meerkattica",

    description:
      "This game was created for Ludum Dare 48. Dig deeply and quickly to get to your next metal gig, but watch out for the mechanical snake that pursues you!",
    url: "http://excaliburjs.com/ludum-48/",
    source: "https://github.com/excaliburjs/ludum-48",
  },
  {
    title: "The Show Must Go On",
    value: "The Show Must Go On",

    description:
      "This game was created for Ludum Dare 46. Keep the theater production going as the only actor!",
    url: "http://excaliburjs.com/ludum-46/",
    source: "https://github.com/excaliburjs/ludum-46",
  },
  {
    title: "Office Daydream",
    value: "Office Daydream",

    description:
      "This game was created for Ludum Dare 41. Balance the needs of your job with the needs of your dream!",
    url: "http://excaliburjs.com/ludum-41/",
    source: "https://github.com/excaliburjs/ludum-41",
  },
  {
    title: "I Just Wanted Groceries",
    value: "I Just Wanted Groceries",

    description:
      "This game was created for Ludum Dare 38. Avoid talking to people and finish your shopping!",
    url: "http://excaliburjs.com/ludum-38/",
    source: "https://github.com/excaliburjs/ludum-38",
  },
  {
    title: "Hexshaper",
    value: "Hexshaper",

    description:
      "This game was created for Ludum Dare 35. Absorb enemy projectiles and close the portals!",
    url: "http://excaliburjs.com/ludum-35/",
    source: "https://github.com/excaliburjs/ludum-35",
  },
  {
    title: "Crypt of the Minotaur",
    value: "Crypt of the Minotaur",

    description:
      "This game was created for Ludum Dare 33. Play as the Minotaur to defend your treasure!",
    url: "http://excaliburjs.com/ludum-33/",
    source: "https://github.com/excaliburjs/ludum-33",
  },
  {
    title: "Sweep Stacks",
    value: "Sweep Stacks",

    description:
      "This game was created for Ludum Dare 31. Sweep across the screen to clear blocks!",
    url: "http://excaliburjs.com/sweep/",
    source: "https://github.com/excaliburjs/sweep",
  },
  {
    title: "Kraken Unchained",
    value: "Kraken Unchained",

    description:
      "This game was created for Ludum Dare 29. Play as the Kraken and destroy ships!",
    url: "http://krakenunchained.azurewebsites.net",
    source: "https://github.com/excaliburjs/Ludum-29",
  },
];


export const SAMPLES = [
  {
    name: "🐦 Excalibird (Flappy Bird Clone)",
    value: "typescript_excalibird",
    description: "",
    repo: "https://github.com/excaliburjs/sample-excalibird",
    startCommand: "npm run start",
  },
  {
    name: "🐸 Jelly Jumper (Mario Clone)",
    value: "typescript_excalibird",
    description: "",
    repo: "https://github.com/excaliburjs/sample-excalibird",
    startCommand: "npm run start",
  },
  {
    name: "🥾 Platformer",
    value: "typescript_platformer",
    description: "",
    repo: "https://github.com/excaliburjs/sample-platformer",
    startCommand: "npm run start",
  },
  {
    name: "📈 Grid Based Movement",
    value: "typescript_grid",
    description: "",
    repo: "https://github.com/excaliburjs/sample-grid",
    startCommand: "npm run start",
  },
  {
    name: "♟️ Tactics",
    value: "typescript_tactics",
    description: "",
    repo: "https://github.com/excaliburjs/sample-tactics",
    startCommand: "npm run start",
  },
  {
    name: "💻 React UI",
    value: "typescript_react",
    description: "",
    repo: "https://github.com/excaliburjs/sample-react",
    startCommand: "npm run start",
  },
  {
    name: "💻 Vanilla HTML UI",
    value: "typescript_html",
    description: "",
    repo: "https://github.com/excaliburjs/sample-html",
    startCommand: "npm run start",
  },
  {
    name: "🗺️ Tiled Tile Maps",
    value: "typescript_tiled",
    description: "",
    repo: "https://github.com/excaliburjs/sample-tiled-vite",
    startCommand: "npm run start",
  },
  {
    name: "🗺️ LDtk Tile Maps",
    value: "typescript_ldtk",
    description: "",
    repo: "https://github.com/excaliburjs/sample-ldtk",
    startCommand: "npm run start",
  },
  {
    name: "🗺️ Spritefusion Tile Maps",
    value: "typescript_spritefusion",
    description: "",
    repo: "https://github.com/excaliburjs/sample-spritefusion",
    startCommand: "npm run start",
  },
  {
    name: "🗺️ Spritefusion Tile Maps",
    value: "typescript_spritefusion",
    description: "",
    repo: "https://github.com/excaliburjs/sample-spritefusion",
    startCommand: "npm run start",
  },
  {
    name: "🎯 Pathfinding",
    value: "typescript_pathfinding",
    description: "",
    repo: "https://github.com/excaliburjs/sample-pathfinding",
    startCommand: "npm run start",
  },
  {
    name: "📦 Matter.js",
    value: "typescript_matterjs",
    description: "",
    repo: "https://github.com/excaliburjs/sample-matterjs",
    startCommand: "npm run start",
  },
]