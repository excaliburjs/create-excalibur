import { terminal, textBlue, textGray } from "../console.ts";

export default function intro(): void {
  const sword = `
        /| ________________
  O|===|${textBlue("*")} >________________>
        \\|
  `;
  //
  terminal.line();
  //   terminal.blank();
  terminal.print(" Welcome to Excalibur JS! ", textBlue);
  terminal.print(sword);
  terminal.print(
    " Your friendly TypeScript 2D game engine for the web.",
    textGray
  );
  terminal.blank();
  terminal.blank();
  //   terminal.printLine();
}
