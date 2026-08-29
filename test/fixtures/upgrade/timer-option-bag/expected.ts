import { Timer } from "excalibur";

export const tick = new Timer({ fcn: () => console.log("tick"), interval: 1000, repeats: true });
export const modern = new Timer({ fcn: () => {}, interval: 500 }); // already migrated — untouched
