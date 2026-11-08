import { ImageSource, Material } from "excalibur";

export function wire(material: Material, image: ImageSource, rotation: number[]): void {
  material.update(shader => {
    shader.addImageSource('text', image);
  });
  material.update(shader => shader.setUniform('uniform4fv', 'accumulatedRotation', rotation));
  material.update(function (shader) {
    shader.trySetUniformFloatArray('u_weights', rotation);
  });
  material.update((shader) => {});
}
