import Point from "@mapbox/point-geometry";
import { PmtilesSource, TileCache, ZxySource } from "./tilecache";

/*
 * PreparedTile
 * For a given display Z:
 * layers: map of names-> features with coordinates in CSS pixel units.
 * translate: how to get layers coordinates to global Z coordinates.
 * dataTile: the Z,X,Y of the data tile.
 * window? if present, use as bounding box or canvas clipping area.
 */

// TODO make this lazy
export const transformGeom = (geom, scale, translate) => {
  const retval = [];
  for (const arr of geom) {
    const loop = [];
    for (const coord of arr) {
      loop.push(coord.clone().mult(scale).add(translate));
    }
    retval.push(loop);
  }
  return retval;
};

export const wrap = (val, z) => {
  const dim = 1 << z;
  if (val < 0) return dim + val;
  if (val >= dim) return val % dim;
  return val;
};

/*
 * @class View
 * expresses relationship between canvas coordinates and data tiles.
 */
export class View {
  levelDiff;
  tileCache;
  maxDataLevel;

  constructor(tileCache, maxDataLevel, levelDiff) {
    this.tileCache = tileCache;
    this.maxDataLevel = maxDataLevel;
    this.levelDiff = levelDiff;
  }

  dataTilesForBounds(displayZoom, bounds) {
    const fractional = 2 ** displayZoom / 2 ** Math.ceil(displayZoom);
    const needed = [];
    let scale = 1;
    const dim = this.tileCache.tileSize;
    if (displayZoom < this.levelDiff) {
      scale = (1 / (1 << (this.levelDiff - displayZoom))) * fractional;
      needed.push({
        dataTile: { z: 0, x: 0, y: 0 },
        origin: new Point(0, 0),
        scale: scale,
        dim: dim * scale,
      });
    } else if (displayZoom <= this.levelDiff + this.maxDataLevel) {
      const f = 1 << this.levelDiff;

      const basetileSize = 256 * fractional;

      const dataZoom = Math.ceil(displayZoom) - this.levelDiff;

      const mintileX = Math.floor(bounds.minX / f / basetileSize);
      const mintileY = Math.floor(bounds.minY / f / basetileSize);
      const maxtileX = Math.floor(bounds.maxX / f / basetileSize);
      const maxtileY = Math.floor(bounds.maxY / f / basetileSize);
      for (let tx = mintileX; tx <= maxtileX; tx++) {
        for (let ty = mintileY; ty <= maxtileY; ty++) {
          const origin = new Point(
            tx * f * basetileSize,
            ty * f * basetileSize
          );
          needed.push({
            dataTile: {
              z: dataZoom,
              x: wrap(tx, dataZoom),
              y: wrap(ty, dataZoom),
            },
            origin: origin,
            scale: fractional,
            dim: dim * fractional,
          });
        }
      }
    } else {
      const f = 1 << this.levelDiff;
      scale =
        (1 << (Math.ceil(displayZoom) - this.maxDataLevel - this.levelDiff)) *
        fractional;
      const mintileX = Math.floor(bounds.minX / f / 256 / scale);
      const mintileY = Math.floor(bounds.minY / f / 256 / scale);
      const maxtileX = Math.floor(bounds.maxX / f / 256 / scale);
      const maxtileY = Math.floor(bounds.maxY / f / 256 / scale);
      for (let tx = mintileX; tx <= maxtileX; tx++) {
        for (let ty = mintileY; ty <= maxtileY; ty++) {
          const origin = new Point(tx * f * 256 * scale, ty * f * 256 * scale);
          needed.push({
            dataTile: {
              z: this.maxDataLevel,
              x: wrap(tx, this.maxDataLevel),
              y: wrap(ty, this.maxDataLevel),
            },
            origin: origin,
            scale: scale,
            dim: dim * scale,
          });
        }
      }
    }
    return needed;
  }

  dataTileForDisplayTile(displayTile) {
    let dataTile;
    let scale = 1;
    let dim = this.tileCache.tileSize;
    let origin;
    if (displayTile.z < this.levelDiff) {
      dataTile = { z: 0, x: 0, y: 0 };
      scale = 1 / (1 << (this.levelDiff - displayTile.z));
      origin = new Point(0, 0);
      dim = dim * scale;
    } else if (displayTile.z <= this.levelDiff + this.maxDataLevel) {
      const f = 1 << this.levelDiff;
      dataTile = {
        z: displayTile.z - this.levelDiff,
        x: Math.floor(displayTile.x / f),
        y: Math.floor(displayTile.y / f),
      };
      origin = new Point(dataTile.x * f * 256, dataTile.y * f * 256);
    } else {
      scale = 1 << (displayTile.z - this.maxDataLevel - this.levelDiff);
      const f = 1 << this.levelDiff;
      dataTile = {
        z: this.maxDataLevel,
        x: Math.floor(displayTile.x / f / scale),
        y: Math.floor(displayTile.y / f / scale),
      };
      origin = new Point(
        dataTile.x * f * scale * 256,
        dataTile.y * f * scale * 256
      );
      dim = dim * scale;
    }
    return { dataTile: dataTile, scale: scale, origin: origin, dim: dim };
  }

  async getBbox(displayZoom, bounds) {
    const needed = this.dataTilesForBounds(displayZoom, bounds);
    const result = await Promise.all(
      needed.map((tt) => this.tileCache.get(tt.dataTile))
    );
    return result.map((data, i) => {
      const tt = needed[i];
      return {
        data: data,
        z: displayZoom,
        dataTile: tt.dataTile,
        scale: tt.scale,
        dim: tt.dim,
        origin: tt.origin,
      };
    });
  }

  async getDisplayTile(displayTile) {
    const tt = this.dataTileForDisplayTile(displayTile);
    const data = await this.tileCache.get(tt.dataTile);
    return {
      data: data,
      z: displayTile.z,
      dataTile: tt.dataTile,
      scale: tt.scale,
      origin: tt.origin,
      dim: tt.dim,
    };
  }

  queryFeatures(lng, lat, displayZoom, brushSize) {
    const roundedZoom = Math.round(displayZoom);
    const dataZoom = Math.min(roundedZoom - this.levelDiff, this.maxDataLevel);
    const brushSizeAtZoom = brushSize / (1 << (roundedZoom - dataZoom));
    return this.tileCache.queryFeatures(lng, lat, dataZoom, brushSizeAtZoom);
  }
}

export const sourcesToViews = (options) => {
  const sourceToViews = (o) => {
    const levelDiff = o.levelDiff === undefined ? 1 : o.levelDiff;
    const maxDataZoom = o.maxDataZoom || 15;
    let source;
    if (typeof o.url === "string") {
      if (new URL(o.url, "http://example.com").pathname.endsWith(".pmtiles")) {
        source = new PmtilesSource(o.url, true);
      } else {
        source = new ZxySource(o.url, true);
      }
    } else if (o.url) {
      source = new PmtilesSource(o.url, true);
    } else {
      throw new Error(`Invalid source ${o.url}`);
    }

    const cache = new TileCache(source, (256 * 1) << levelDiff);
    return new View(cache, maxDataZoom, levelDiff);
  };

  const sources = new Map();
  if (options.sources) {
    for (const key in options.sources) {
      sources.set(key, sourceToViews(options.sources[key]));
    }
  } else {
    sources.set("", sourceToViews(options));
  }
  return sources;
};
