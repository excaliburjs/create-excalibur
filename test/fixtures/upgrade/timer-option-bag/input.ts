import { Timer } from "excalibur";

export const tick = new Timer(() => console.log("tick"), 1000, true);
export const modern = new Timer({ fcn: () => {}, interval: 500 }); // already migrated — untouched
