import { Color, Material, vec } from "excalibur";

export function tick(material: Material, size: number, zoom: number): void {
  material.update(shader => {
    shader.trySetUniformFloat('u_spacing', size);
    shader.trySetUniformFloat('u_width', 1);
    const offset = vec(size, size).scale(1 / zoom);
    shader.trySetUniformFloatVector('u_offset', offset);
    shader.trySetUniformFloatColor('u_background_color', Color.ExcaliburBlue);
  });
  material.update((shader) => shader.trySetUniformFloat('u_zoom', zoom));
  material.update((shader: any) => {
    shader.trySetUniformFloatVector('u_camera', vec(0, 0));
  });
}
