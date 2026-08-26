import { ScreenShader } from "excalibur";

export const shader = new ScreenShader(`#version 300 es
precision mediump float;
in vec2 v_texcoord;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_texcoord, 0.0, 1.0);
}
`);
