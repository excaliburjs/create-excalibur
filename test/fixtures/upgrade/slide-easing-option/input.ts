import { Slide, Easing, easeInOutCubic } from "excalibur";

export const slide = new Slide({ duration: 500, slideDirection: "up", easingFunction: easeInOutCubic });
interface TweenOptions { duration: number; easingFunction?: Easing } // a user options type: untouched
export const tweenOptions: TweenOptions = { duration: 500, easingFunction: easeInOutCubic };
export const tween = { easingFunction: easeInOutCubic };
