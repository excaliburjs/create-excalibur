import { TestClock, TestClockOptions } from "excalibur";

export const clock = new TestClock({ tick: () => {}, defaultUpdateMs: 16.6 });
export const options: TestClockOptions = { "defaultUpdateMs": 33 };
export const loose = { defaultUpdateMs: 1 }; // not excalibur's key
