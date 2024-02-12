import { log, textBlue } from "../console.js";

export default function intro() {
  const sword1 = `
        /| ________________
  O|===|${textBlue("*")} >________________>
        \\|
  `;

  log();
  log(sword1);
  log(" Welcome to Excalibur JS! ");
  log(" Your friendly TypeScript 2D game engine for the web.");
  log();
  log();
}
