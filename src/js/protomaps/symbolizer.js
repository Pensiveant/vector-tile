import Point from "@mapbox/point-geometry";
import {
  ArrayAttr,
  FontAttr,
  NumberAttr,
  StringAttr,
  TextAttr,
} from "./attribute";

import { lineCells, simpleLabel } from "./line";

import { linebreak } from "./text";
import { GeomType } from "./tilecache";

export const Justify = {
  Left: 1,
  Center: 2,
  Right: 3,
};

export const TextPlacements = {
  N: 1,
  Ne: 2,
  E: 3,
  Se: 4,
  S: 5,
  Sw: 6,
  W: 7,
  Nw: 8,
};

export const createPattern = (width, height, fn) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;
  if (ctx !== null) fn(canvas, ctx);
  return canvas;
};

export class PolygonSymbolizer {
  pattern;
  fill;
  opacity;
  stroke;
  width;
  perFeature;
  doStroke;

  constructor(options) {
    this.pattern = options.pattern;
    this.fill = new StringAttr(options.fill, "black");
    this.opacity = new NumberAttr(options.opacity, 1);
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.perFeature =
      (this.fill.perFeature ||
        this.opacity.perFeature ||
        this.stroke.perFeature ||
        this.width.perFeature ||
        options.perFeature) ??
      false;
    this.doStroke = false;
  }

  before(ctx, z) {
    if (!this.perFeature) {
      ctx.globalAlpha = this.opacity.get(z);
      ctx.fillStyle = this.fill.get(z);
      ctx.strokeStyle = this.stroke.get(z);
      const width = this.width.get(z);
      if (width > 0) this.doStroke = true;
      ctx.lineWidth = width;
    }
    if (this.pattern) {
      const patten = ctx.createPattern(this.pattern, "repeat");
      if (patten) ctx.fillStyle = patten;
    }
  }

  draw(ctx, geom, z, f) {
    let doStroke = false;
    if (this.perFeature) {
      ctx.globalAlpha = this.opacity.get(z, f);
      ctx.fillStyle = this.fill.get(z, f);
      const width = this.width.get(z, f);
      if (width) {
        doStroke = true;
        ctx.strokeStyle = this.stroke.get(z, f);
        ctx.lineWidth = width;
      }
    }

    const drawPath = () => {
      ctx.fill();
      if (doStroke || this.doStroke) {
        ctx.stroke();
      }
    };

    ctx.beginPath();
    for (const poly of geom) {
      for (let p = 0; p < poly.length; p++) {
        const pt = poly[p];
        if (p === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
    }
    drawPath();
  }
}

export function arr(base, a) {
  return (z) => {
    const b = z - base;
    if (b >= 0 && b < a.length) {
      return a[b];
    }
    return 0;
  };
}

function getStopIndex(input, stops) {
  let idx = 0;
  while (stops[idx + 1][0] < input) idx++;
  return idx;
}

function interpolate(factor, start, end) {
  return factor * (end - start) + start;
}

function computeInterpolationFactor(z, idx, base, stops) {
  const difference = stops[idx + 1][0] - stops[idx][0];
  const progress = z - stops[idx][0];
  if (difference === 0) return 0;
  if (base === 1) return progress / difference;
  return (base ** progress - 1) / (base ** difference - 1);
}

export function exp(base, stops) {
  return (z) => {
    if (stops.length < 1) return 0;
    if (z <= stops[0][0]) return stops[0][1];
    if (z >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    const idx = getStopIndex(z, stops);
    const factor = computeInterpolationFactor(z, idx, base, stops);
    return interpolate(factor, stops[idx][1], stops[idx + 1][1]);
  };
}

export function step(output0, stops) {
  // Step computes discrete results by evaluating a piecewise-constant
  // function defined by stops.
  // Returns the output value of the stop with a stop input value just less than
  // the input one. If the input value is less than the input of the first stop,
  // output0 is returned
  return (z) => {
    if (stops.length < 1) return 0;
    let retval = output0;
    for (let i = 0; i < stops.length; i++) {
      if (z >= stops[i][0]) retval = stops[i][1];
    }
    return retval;
  };
}

export function linear(stops) {
  return exp(1, stops);
}

export class LineSymbolizer {
  color;
  width;
  opacity;
  dash;
  dashColor;
  dashWidth;
  skip;
  perFeature;
  lineCap;
  lineJoin;

  constructor(options) {
    this.color = new StringAttr(options.color, "black");
    this.width = new NumberAttr(options.width);
    this.opacity = new NumberAttr(options.opacity);
    this.dash = options.dash ? new ArrayAttr(options.dash) : null;
    this.dashColor = new StringAttr(options.dashColor, "black");
    this.dashWidth = new NumberAttr(options.dashWidth, 1.0);
    this.lineCap = new StringAttr(options.lineCap, "butt");
    this.lineJoin = new StringAttr(options.lineJoin, "miter");
    this.skip = false;
    this.perFeature = !!(
      this.dash?.perFeature ||
      this.color.perFeature ||
      this.opacity.perFeature ||
      this.width.perFeature ||
      this.lineCap.perFeature ||
      this.lineJoin.perFeature ||
      options.perFeature
    );
  }

  before(ctx, z) {
    if (!this.perFeature) {
      ctx.strokeStyle = this.color.get(z);
      ctx.lineWidth = this.width.get(z);
      ctx.globalAlpha = this.opacity.get(z);
      ctx.lineCap = this.lineCap.get(z);
      ctx.lineJoin = this.lineJoin.get(z);
    }
  }

  draw(ctx, geom, z, f) {
    if (this.skip) return;

    const strokePath = () => {
      if (this.perFeature) {
        ctx.globalAlpha = this.opacity.get(z, f);
        ctx.lineCap = this.lineCap.get(z, f);
        ctx.lineJoin = this.lineJoin.get(z, f);
      }
      if (this.dash) {
        ctx.save();
        if (this.perFeature) {
          ctx.lineWidth = this.dashWidth.get(z, f);
          ctx.strokeStyle = this.dashColor.get(z, f);
          ctx.setLineDash(this.dash.get(z, f));
        } else {
          ctx.setLineDash(this.dash.get(z));
        }
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        if (this.perFeature) {
          ctx.lineWidth = this.width.get(z, f);
          ctx.strokeStyle = this.color.get(z, f);
        }
        ctx.stroke();
        ctx.restore();
      }
    };

    ctx.beginPath();
    for (const ls of geom) {
      for (let p = 0; p < ls.length; p++) {
        const pt = ls[p];
        if (p === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
    }
    strokePath();
  }
}

export class IconSymbolizer {
  name;
  sheet;
  dpr;

  constructor(options) {
    this.name = options.name;
    this.sheet = options.sheet;
    this.dpr = window.devicePixelRatio;
  }

  place(layout, geom, feature) {
    const pt = geom[0];
    const a = new Point(geom[0][0].x, geom[0][0].y);
    let name = this.name;
    if (/{/.test(name) && /}/.test(name)) {
      // 名字中存在从属性读值情况
      let field = name.split("{")[1].split("}")[0];
      let fieldValue = feature.props[field];
      name = name.replace(`{${field}}`, fieldValue);
    }

    const loc = this.sheet.get(name);
    const width = loc.w / this.dpr;
    const height = loc.h / this.dpr;

    const bbox = {
      minX: a.x - width / 2,
      minY: a.y - height / 2,
      maxX: a.x + width / 2,
      maxY: a.y + height / 2,
    };

    const draw = (ctx) => {
      ctx.globalAlpha = 1;
      ctx.drawImage(
        this.sheet.canvas,
        loc.x,
        loc.y,
        loc.w,
        loc.h,
        -loc.w / 2 / this.dpr,
        -loc.h / 2 / this.dpr,
        loc.w / 2,
        loc.h / 2
      );
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

export class CircleSymbolizer {
  radius;
  fill;
  stroke;
  width;
  opacity;

  constructor(options) {
    this.radius = new NumberAttr(options.radius, 3);
    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "white");
    this.width = new NumberAttr(options.width, 0);
    this.opacity = new NumberAttr(options.opacity);
  }

  draw(ctx, geom, z, f) {
    ctx.globalAlpha = this.opacity.get(z, f);

    const radius = this.radius.get(z, f);
    const width = this.width.get(z, f);
    if (width > 0) {
      ctx.strokeStyle = this.stroke.get(z, f);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(geom[0][0].x, geom[0][0].y, radius + width / 2, 0, 2 * Math.PI);
      ctx.stroke();
    }

    ctx.fillStyle = this.fill.get(z, f);
    ctx.beginPath();
    ctx.arc(geom[0][0].x, geom[0][0].y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  place(layout, geom, feature) {
    const pt = geom[0];
    const a = new Point(geom[0][0].x, geom[0][0].y);
    const radius = this.radius.get(layout.zoom, feature);
    const bbox = {
      minX: a.x - radius,
      minY: a.y - radius,
      maxX: a.x + radius,
      maxY: a.y + radius,
    };

    const draw = (ctx) => {
      this.draw(ctx, [[new Point(0, 0)]], layout.zoom, feature);
    };
    return [{ anchor: a, bboxes: [bbox], draw }];
  }
}

export class ShieldSymbolizer {
  font;
  text;
  background;
  fill;
  padding;

  constructor(options) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);
    this.fill = new StringAttr(options.fill, "black");
    this.background = new StringAttr(options.background, "white");
    this.padding = new NumberAttr(options.padding, 0); // TODO check falsy
  }

  place(layout, geom, f) {
    const property = this.text.get(layout.zoom, f);
    if (!property) return undefined;
    const font = this.font.get(layout.zoom, f);
    layout.scratch.font = font;
    const metrics = layout.scratch.measureText(property);

    const width = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;

    const pt = geom[0];
    const a = new Point(geom[0][0].x, geom[0][0].y);
    const p = this.padding.get(layout.zoom, f);
    const bbox = {
      minX: a.x - width / 2 - p,
      minY: a.y - ascent - p,
      maxX: a.x + width / 2 + p,
      maxY: a.y + descent + p,
    };

    const draw = (ctx) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = this.background.get(layout.zoom, f);
      ctx.fillRect(
        -width / 2 - p,
        -ascent - p,
        width + 2 * p,
        ascent + descent + 2 * p
      );
      ctx.fillStyle = this.fill.get(layout.zoom, f);
      ctx.font = font;
      ctx.fillText(property, -width / 2, 0);
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

// TODO make me work with multiple anchors
export class FlexSymbolizer {
  list;

  constructor(list) {
    this.list = list;
  }

  place(layout, geom, feature) {
    let labels = this.list[0].place(layout, geom, feature);
    if (!labels) return undefined;
    let label = labels[0];
    const anchor = label.anchor;
    let bbox = label.bboxes[0];
    const height = bbox.maxY - bbox.minY;
    const draws = [{ draw: label.draw, translate: { x: 0, y: 0 } }];

    const newGeom = [[new Point(geom[0][0].x, geom[0][0].y + height)]];
    for (let i = 1; i < this.list.length; i++) {
      labels = this.list[i].place(layout, newGeom, feature);
      if (labels) {
        label = labels[0];
        bbox = mergeBbox(bbox, label.bboxes[0]);
        draws.push({ draw: label.draw, translate: { x: 0, y: height } });
      }
    }

    const draw = (ctx) => {
      for (const sub of draws) {
        ctx.save();
        ctx.translate(sub.translate.x, sub.translate.y);
        sub.draw(ctx);
        ctx.restore();
      }
    };

    return [{ anchor: anchor, bboxes: [bbox], draw: draw }];
  }
}

const mergeBbox = (b1, b2) => {
  return {
    minX: Math.min(b1.minX, b2.minX),
    minY: Math.min(b1.minY, b2.minY),
    maxX: Math.max(b1.maxX, b2.maxX),
    maxY: Math.max(b1.maxY, b2.maxY),
  };
};

export class GroupSymbolizer {
  list;

  constructor(list) {
    this.list = list;
  }

  place(layout, geom, feature) {
    const first = this.list[0];
    if (!first) return undefined;
    let labels = first.place(layout, geom, feature);
    if (!labels) return undefined;
    let label = labels[0];
    const anchor = label.anchor;
    let bbox = label.bboxes[0];
    const draws = [label.draw];

    for (let i = 1; i < this.list.length; i++) {
      labels = this.list[i].place(layout, geom, feature);
      if (!labels) return undefined;
      label = labels[0];
      bbox = mergeBbox(bbox, label.bboxes[0]);
      draws.push(label.draw);
    }
    const draw = (ctx) => {
      for (const d of draws) {
        d(ctx);
      }
    };

    return [{ anchor: anchor, bboxes: [bbox], draw: draw }];
  }
}

export class CenteredSymbolizer {
  symbolizer;

  constructor(symbolizer) {
    this.symbolizer = symbolizer;
  }

  place(layout, geom, feature) {
    const a = geom[0][0];
    const placed = this.symbolizer.place(layout, [[new Point(0, 0)]], feature);
    if (!placed || placed.length === 0) return undefined;
    const firstLabel = placed[0];
    const bbox = firstLabel.bboxes[0];
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    const centered = {
      minX: a.x - width / 2,
      maxX: a.x + width / 2,
      minY: a.y - height / 2,
      maxY: a.y + height / 2,
    };

    const draw = (ctx) => {
      ctx.translate(-width / 2, height / 2 - bbox.maxY);
      firstLabel.draw(ctx, { justify: justify.Center });
    };

    return [{ anchor: a, bboxes: [centered], draw: draw }];
  }
}

export class Padding {
  symbolizer;
  padding;

  constructor(padding, symbolizer) {
    this.padding = new NumberAttr(padding, 0);
    this.symbolizer = symbolizer;
  }

  place(layout, geom, feature) {
    const placed = this.symbolizer.place(layout, geom, feature);
    if (!placed || placed.length === 0) return undefined;
    const padding = this.padding.get(layout.zoom, feature);
    for (const label of placed) {
      for (const bbox of label.bboxes) {
        bbox.minX -= padding;
        bbox.minY -= padding;
        bbox.maxX += padding;
        bbox.maxY += padding;
      }
    }
    return placed;
  }
}

export class TextSymbolizer {
  font;
  text;
  fill;
  stroke;
  width;
  lineHeight; // in ems
  letterSpacing; // in px
  maxLineCodeUnits;
  justify;

  constructor(options) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);

    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.lineHeight = new NumberAttr(options.lineHeight, 1);
    this.letterSpacing = new NumberAttr(options.letterSpacing, 0);
    this.maxLineCodeUnits = new NumberAttr(options.maxLineChars, 15);
    this.justify = options.justify;
  }

  place(layout, geom, feature) {
    const property = this.text.get(layout.zoom, feature);
    if (!property) return undefined;
    const font = this.font.get(layout.zoom, feature);
    layout.scratch.font = font;

    const letterSpacing = this.letterSpacing.get(layout.zoom, feature);

    // line breaking
    const lines = linebreak(
      property,
      this.maxLineCodeUnits.get(layout.zoom, feature)
    );
    let longestLine = "";
    let longestLineLen = 0;
    for (const line of lines) {
      if (line.length > longestLineLen) {
        longestLineLen = line.length;
        longestLine = line;
      }
    }

    const metrics = layout.scratch.measureText(longestLine);
    const width = metrics.width + letterSpacing * (longestLineLen - 1);

    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    const lineHeight =
      (ascent + descent) * this.lineHeight.get(layout.zoom, feature);

    const a = new Point(geom[0][0].x, geom[0][0].y);
    const bbox = {
      minX: a.x,
      minY: a.y - ascent,
      maxX: a.x + width,
      maxY: a.y + descent + (lines.length - 1) * lineHeight,
    };

    // inside draw, the origin is the anchor
    // and the anchor is the typographic baseline of the first line
    const draw = (ctx, extra) => {
      ctx.globalAlpha = 1;
      ctx.font = font;
      ctx.fillStyle = this.fill.get(layout.zoom, feature);
      const textStrokeWidth = this.width.get(layout.zoom, feature);

      let y = 0;
      for (const line of lines) {
        let startX = 0;
        if (
          this.justify === Justify.Center ||
          (extra && extra.justify === Justify.Center)
        ) {
          startX = (width - ctx.measureText(line).width) / 2;
        } else if (
          this.justify === Justify.Right ||
          (extra && extra.justify === Justify.Right)
        ) {
          startX = width - ctx.measureText(line).width;
        }
        if (textStrokeWidth) {
          ctx.lineWidth = textStrokeWidth * 2; // centered stroke
          ctx.strokeStyle = this.stroke.get(layout.zoom, feature);
          if (letterSpacing > 0) {
            let xPos = startX;
            for (const letter of line) {
              ctx.strokeText(letter, xPos, y);
              xPos += ctx.measureText(letter).width + letterSpacing;
            }
          } else {
            ctx.strokeText(line, startX, y);
          }
        }
        if (letterSpacing > 0) {
          let xPos = startX;
          for (const letter of line) {
            ctx.fillText(letter, xPos, y);
            xPos += ctx.measureText(letter).width + letterSpacing;
          }
        } else {
          ctx.fillText(line, startX, y);
        }
        y += lineHeight;
      }
    };
    return [{ anchor: a, bboxes: [bbox], draw: draw }];
  }
}

export class CenteredTextSymbolizer {
  centered;

  constructor(options) {
    this.centered = new CenteredSymbolizer(new TextSymbolizer(options));
  }

  place(layout, geom, feature) {
    return this.centered.place(layout, geom, feature);
  }
}

export class OffsetSymbolizer {
  symbolizer;
  offsetX;
  offsetY;
  justify;
  placements;
  ddValues;

  constructor(symbolizer, options) {
    this.symbolizer = symbolizer;
    this.offsetX = new NumberAttr(options.offsetX, 0);
    this.offsetY = new NumberAttr(options.offsetY, 0);
    this.justify = options.justify ?? undefined;
    this.placements = options.placements ?? [
      TextPlacements.Ne,
      TextPlacements.Sw,
      TextPlacements.Nw,
      TextPlacements.Se,
      TextPlacements.N,
      TextPlacements.E,
      TextPlacements.S,
      TextPlacements.W,
    ];
    this.ddValues =
      options.ddValues ??
      (() => {
        return {};
      });
  }

  place(layout, geom, feature) {
    if (feature.geomType !== GeomType.Point) return undefined;
    const anchor = geom[0][0];
    const placed = this.symbolizer.place(layout, [[new Point(0, 0)]], feature);
    if (!placed || placed.length === 0) return undefined;
    const firstLabel = placed[0];
    const fb = firstLabel.bboxes[0];

    // Overwrite options values via the data driven function if exists
    let offsetXvalue = this.offsetX;
    let offsetYvalue = this.offsetY;
    let justifyValue = this.justify;
    let placements = this.placements;
    const {
      offsetX: ddOffsetX,
      offsetY: ddOffsetY,
      justify: ddJustify,
      placements: ddPlacements,
    } = this.ddValues(layout.zoom, feature) || {};
    if (ddOffsetX) offsetXvalue = new NumberAttr(ddOffsetX, 0);
    if (ddOffsetY) offsetYvalue = new NumberAttr(ddOffsetY, 0);
    if (ddJustify) justifyValue = ddJustify;
    if (ddPlacements) placements = ddPlacements;

    const offsetX = offsetXvalue.get(layout.zoom, feature);
    const offsetY = offsetYvalue.get(layout.zoom, feature);

    const getBbox = (a, o) => {
      return {
        minX: a.x + o.x + fb.minX,
        minY: a.y + o.y + fb.minY,
        maxX: a.x + o.x + fb.maxX,
        maxY: a.y + o.y + fb.maxY,
      };
    };

    let origin = new Point(offsetX, offsetY);
    let justify;
    const draw = (ctx) => {
      ctx.translate(origin.x, origin.y);
      firstLabel.draw(ctx, { justify });
    };

    const placeLabelInPoint = (a, o) => {
      const bbox = getBbox(a, o);
      if (!layout.index.bboxCollides(bbox, layout.order))
        return [{ anchor: anchor, bboxes: [bbox], draw: draw }];
    };

    for (const placement of placements) {
      const xAxisOffset = this.computeXaxisOffset(offsetX, fb, placement);
      const yAxisOffset = this.computeYaxisOffset(offsetY, fb, placement);
      justify = this.computeJustify(justifyValue, placement);
      origin = new Point(xAxisOffset, yAxisOffset);
      return placeLabelInPoint(anchor, origin);
    }

    return undefined;
  }

  computeXaxisOffset(offsetX, fb, placement) {
    const labelWidth = fb.maxX;
    const labelHalfWidth = labelWidth / 2;
    if ([TextPlacements.N, TextPlacements.S].includes(placement))
      return offsetX - labelHalfWidth;
    if (
      [TextPlacements.Nw, TextPlacements.W, TextPlacements.Sw].includes(
        placement
      )
    )
      return offsetX - labelWidth;
    return offsetX;
  }

  computeYaxisOffset(offsetY, fb, placement) {
    const labelHalfHeight = Math.abs(fb.minY);
    const labelBottom = fb.maxY;
    const labelCenterHeight = (fb.minY + fb.maxY) / 2;
    if ([TextPlacements.E, TextPlacements.W].includes(placement))
      return offsetY - labelCenterHeight;
    if (
      [TextPlacements.Nw, TextPlacements.Ne, TextPlacements.N].includes(
        placement
      )
    )
      return offsetY - labelBottom;
    if (
      [TextPlacements.Sw, TextPlacements.Se, TextPlacements.S].includes(
        placement
      )
    )
      return offsetY + labelHalfHeight;
    return offsetY;
  }

  computeJustify(fixedJustify, placement) {
    if (fixedJustify) return fixedJustify;
    if ([TextPlacements.N, TextPlacements.S].includes(placement))
      return Justify.Center;
    if (
      [TextPlacements.Ne, TextPlacements.E, TextPlacements.Se].includes(
        placement
      )
    )
      return Justify.Left;
    return Justify.Right;
  }
}

export class OffsetTextSymbolizer {
  symbolizer;

  constructor(options) {
    this.symbolizer = new OffsetSymbolizer(
      new TextSymbolizer(options),
      options
    );
  }

  place(layout, geom, feature) {
    return this.symbolizer.place(layout, geom, feature);
  }
}

export const LineLabelPlacement = {
  Above: 1,
  Center: 2,
  Below: 3,
};

export class LineLabelSymbolizer {
  font;
  text;

  fill;
  stroke;
  width;
  offset;
  position;
  maxLabelCodeUnits;
  repeatDistance;

  constructor(options) {
    this.font = new FontAttr(options);
    this.text = new TextAttr(options);

    this.fill = new StringAttr(options.fill, "black");
    this.stroke = new StringAttr(options.stroke, "black");
    this.width = new NumberAttr(options.width, 0);
    this.offset = new NumberAttr(options.offset, 0);
    this.position = options.position ?? LineLabelPlacement.Above;
    this.maxLabelCodeUnits = new NumberAttr(options.maxLabelChars, 40);
    this.repeatDistance = new NumberAttr(options.repeatDistance, 1000);
  }

  place(layout, geom, feature) {
    const name = this.text.get(layout.zoom, feature);
    if (!name) return undefined;
    if (name.length > this.maxLabelCodeUnits.get(layout.zoom, feature))
      return undefined;

    const minLabelableDim = 20;
    const fbbox = feature.bbox;
    if (
      fbbox.maxY - fbbox.minY < minLabelableDim &&
      fbbox.maxX - fbbox.minX < minLabelableDim
    )
      return undefined;

    const font = this.font.get(layout.zoom, feature);
    layout.scratch.font = font;
    const metrics = layout.scratch.measureText(name);
    const width = metrics.width;
    const height =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    let repeatDistance = this.repeatDistance.get(layout.zoom, feature);
    if (layout.overzoom > 4) repeatDistance *= 1 << (layout.overzoom - 4);

    const cellSize = height * 2;

    const labelCandidates = simpleLabel(geom, width, repeatDistance, cellSize);
    if (labelCandidates.length === 0) return undefined;

    const labels = [];
    for (const candidate of labelCandidates) {
      const dx = candidate.end.x - candidate.start.x;
      const dy = candidate.end.y - candidate.start.y;

      const cells = lineCells(
        candidate.start,
        candidate.end,
        width,
        cellSize / 2
      );
      const bboxes = cells.map((c) => {
        return {
          minX: c.x - cellSize / 2,
          minY: c.y - cellSize / 2,
          maxX: c.x + cellSize / 2,
          maxY: c.y + cellSize / 2,
        };
      });

      const draw = (ctx) => {
        ctx.globalAlpha = 1;
        // ctx.beginPath();
        // ctx.moveTo(0, 0);
        // ctx.lineTo(dx, dy);
        // ctx.strokeStyle = "red";
        // ctx.stroke();
        ctx.rotate(Math.atan2(dy, dx));
        if (dx < 0) {
          ctx.scale(-1, -1);
          ctx.translate(-width, 0);
        }
        let heightPlacement = 0;
        if (this.position === LineLabelPlacement.Below)
          heightPlacement += height;
        else if (this.position === LineLabelPlacement.Center)
          heightPlacement += height / 2;
        ctx.translate(
          0,
          heightPlacement - this.offset.get(layout.zoom, feature)
        );
        ctx.font = font;
        const lineWidth = this.width.get(layout.zoom, feature);
        if (lineWidth) {
          ctx.lineWidth = lineWidth;
          ctx.strokeStyle = this.stroke.get(layout.zoom, feature);
          ctx.strokeText(name, 0, 0);
        }
        ctx.fillStyle = this.fill.get(layout.zoom, feature);
        ctx.fillText(name, 0, 0);
      };
      labels.push({
        anchor: candidate.start,
        bboxeses,
        draw: draw,
        deduplicationKey: name,
        deduplicationDistance: repeatDistance,
      });
    }

    return labels;
  }
}
