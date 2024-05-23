export class Sheet {
  json;
  canvas;
  mapping;
  missingBox;

  constructor(json, canvas) {
    this.json = json;
    this.canvas = canvas;
    this.mapping = new Map();
    this.missingBox = { x: 0, y: 0, w: 0, h: 0 };
    const scale = window.devicePixelRatio;
    // 根据 key 分割精灵
    for (let i = 0; i < Object.keys(this.json).length; i++) {
      const k = Object.keys(this.json)[i];
      const v = Object.values(this.json)[i];
      this.mapping.set(k, {
        x: v.x,
        y: v.y,
        w: v.width,
        h: v.height,
      });
    }
  }

  get(name) {
    let result = this.mapping.get(name);
    if (!result) result = this.missingBox;
    return result;
  }
}
