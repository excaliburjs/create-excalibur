import { TestClock, TestClockOptions } from "excalibur";

export const clock = new TestClock({ tick: () => {}, defaultUpdate: 16.6 });
export const options: TestClockOptions = { "defaultUpdate": 33 };
export const loose = { defaultUpdateMs: 1 }; // not excalibur's key
