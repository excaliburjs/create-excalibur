import { ImageSource, Material } from "excalibur";

export function wire(material: Material, image: ImageSource, rotation: number[]): void {
  // ex-upgrade(material-update-context): Material.update() passes a MaterialContext in v1 — this callback was rewritten to keep using the composite shader; prefer `({ uniforms }) => { uniforms.<name> = value }`, which reaches every pipeline pass (for textures, material.addImageSource(name, image) is the v1 API) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  material.update(({ shaders: [shader] }) => {
    shader.use();
    shader.addImageSource('text', image);
  });
  // ex-upgrade(material-update-context): Material.update() passes a MaterialContext in v1 — this callback was rewritten to keep using the composite shader; prefer `({ uniforms }) => { uniforms.<name> = value }`, which reaches every pipeline pass (for textures, material.addImageSource(name, image) is the v1 API) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  material.update(({ shaders: [shader] }) => { shader.use(); shader.setUniform('uniform4fv', 'accumulatedRotation', rotation); });
  // ex-upgrade(material-update-context): Material.update() passes a MaterialContext in v1 — this callback was rewritten to keep using the composite shader; prefer `({ uniforms }) => { uniforms.<name> = value }`, which reaches every pipeline pass (for textures, material.addImageSource(name, image) is the v1 API) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  material.update(function ({ shaders: [shader] }) {
    shader.use();
    shader.trySetUniformFloatArray('u_weights', rotation);
  });
  // ex-upgrade(material-update-context): Material.update() passes a MaterialContext in v1 — this callback was rewritten to keep using the composite shader; prefer `({ uniforms }) => { uniforms.<name> = value }`, which reaches every pipeline pass (for textures, material.addImageSource(name, image) is the v1 API) — https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md
  material.update(({ shaders: [shader] }) => { shader.use(); });
}
