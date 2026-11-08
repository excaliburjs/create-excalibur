import { Color, Material, vec } from "excalibur";

export function tick(material: Material, size: number, zoom: number): void {
  material.update(({ uniforms }) => {
    uniforms.u_spacing = size;
    uniforms.u_width = 1;
    const offset = vec(size, size).scale(1 / zoom);
    uniforms.u_offset = offset;
    uniforms.u_background_color = Color.ExcaliburBlue;
  });
  material.update(({ uniforms }) => { uniforms.u_zoom = zoom; });
  material.update(({ uniforms }) => {
    uniforms.u_camera = vec(0, 0);
  });
}
