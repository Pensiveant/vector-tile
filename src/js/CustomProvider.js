import * as Cesium from "cesium";
import * as protomapsL from "./protomaps/index";
import Point from "@mapbox/point-geometry";

function getFont(obj) {
  let fontfaces = [];
  if (obj["text-font"]) {
    for (let wanted_face of obj["text-font"]) {
      fontfaces.push({ face: wanted_face });
    }
  }
  if (fontfaces.length === 0) fontfaces.push({ face: "sans-serif" });

  const text_size = obj["text-size"];

  if (text_size) {
    if (typeof text_size == "number") {
      return (z) => `${text_size}px ${fontfaces.map((f) => f.face).join(", ")}`;
    } else if (text_size.stops) {
      let base = 1.4;
      if (text_size.base) base = text_size.base;
      else text_size.base = base;
      let t = numberFn(text_size);
      return (z, f) => {
        return `${t(z, f)}px ${fontfaces.map((f) => f.face).join(", ")}`;
      };
    } else if (text_size[0] == "step") {
      let t = numberFn(text_size);
      return (z, f) => {
        return `${t(z, f)}px ${fontfaces.map((f) => f.face).join(", ")}`;
      };
    }
  }

  return (z) => "12px Arial Bold";
}
function widthFn(width_obj, gap_obj) {
  let w = numberOrFn(width_obj, 1);
  let g = numberOrFn(gap_obj);
  return (z, f) => {
    let tmp = typeof w == "number" ? w : w(z, f);
    if (g) {
      return tmp + (typeof g == "number" ? g : g(z, f));
    }
    return tmp;
  };
}

function numberOrFn(obj, defaultValue = 0) {
  if (!obj) return defaultValue;
  if (typeof obj == "number") {
    return obj;
  }
  // If feature f is defined, use numberFn, otherwise use defaultValue
  return (z, f) => (f ? numberFn(obj)(z, f) : defaultValue);
}
function numberFn(obj) {
  if (!obj.base) {
    obj.base = 1;
  }
  if (obj.base && obj.stops) {
    return (z) => {
      return protomapsL.exp(obj.base, obj.stops)(z - 1);
    };
  } else if (
    obj[0] == "interpolate" &&
    obj[1][0] == "exponential" &&
    obj[2] == "zoom"
  ) {
    let slice = obj.slice(3);
    let stops = [];
    for (let i = 0; i < slice.length; i += 2) {
      stops.push([slice[i], slice[i + 1]]);
    }
    return (z) => {
      return protomapsL.exp(obj[1][1], stops)(z - 1);
    };
  } else if (obj[0] == "step" && obj[1][0] == "get") {
    let slice = obj.slice(2);
    let prop = obj[1][1];
    return (z, f) => {
      let val = f?.props[prop];
      if (typeof val === "number") {
        if (val < slice[1]) return slice[0];
        for (let i = 1; i < slice.length; i += 2) {
          if (val <= slice[i]) return slice[i + 1];
        }
      }
      return slice[slice.length - 1];
    };
  } else {
    console.log("Unimplemented numeric fn: ", obj);
    return (z) => 1;
  }
}

function filterFn(arr) {
  // hack around "$type"
  if (arr.includes("$type")) {
    return (z) => true;
  } else if (arr[0] == "==") {
    return (z, f) => f.props[arr[1]] === arr[2];
  } else if (arr[0] == "!=") {
    return (z, f) => f.props[arr[1]] !== arr[2];
  } else if (arr[0] == "!") {
    let sub = filterFn(arr[1]);
    return (z, f) => !sub(z, f);
  } else if (arr[0] === "<") {
    return (z, f) => number(f.props[arr[1]], Infinity) < arr[2];
  } else if (arr[0] === "<=") {
    return (z, f) => number(f.props[arr[1]], Infinity) <= arr[2];
  } else if (arr[0] === ">") {
    return (z, f) => number(f.props[arr[1]], -Infinity) > arr[2];
  } else if (arr[0] === ">=") {
    return (z, f) => number(f.props[arr[1]], -Infinity) >= arr[2];
  } else if (arr[0] === "in") {
    return (z, f) => arr.slice(2, arr.length).includes(f.props[arr[1]]);
  } else if (arr[0] === "!in") {
    return (z, f) => !arr.slice(2, arr.length).includes(f.props[arr[1]]);
  } else if (arr[0] === "has") {
    return (z, f) => f.props.hasOwnProperty(arr[1]);
  } else if (arr[0] === "!has") {
    return (z, f) => !f.props.hasOwnProperty(arr[1]);
  } else if (arr[0] === "all") {
    let parts = arr.slice(1, arr.length).map((e) => filterFn(e));
    return (z, f) =>
      parts.every((p) => {
        return p(z, f);
      });
  } else if (arr[0] === "any") {
    let parts = arr.slice(1, arr.length).map((e) => filterFn(e));
    return (z, f) =>
      parts.some((p) => {
        return p(z, f);
      });
  } else {
    console.log("Unimplemented filter: ", arr[0]);
    return (f) => false;
  }
}
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "Anonymous";
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(`图片${url}加载失败！`);
    };
    image.src = url;
  });
}

class CustomProvider {
  /**
   * ArcGIS矢量切片图层加载
   * @constructor
   * @param {Object} options
   * @param {string} options.url                          ArcGIS矢量切片图层服务地址
   * @param {number} options.tileWidth                    切片宽度
   * @param {number} options.tileHeight                   切片高度
   * @param {number} options.minimumLevel                 最小显示层
   * @param {number} options.maximumLevel                 最大显示层
   * @param {number} options.maximumNativeLevel           矢量切片的最大切片层级
   * @param {Cesium.Rectangle} options.rectangle          显示范围
   * @param {Cesium.TilingScheme} options.tilingScheme
   * @param {string} options.requestTrailer
   * @param {number} options.buf
   * @param {number} options.tileSize
   * @param {number} options.levelDiff
   * @param {string} options.debug
   * @param {number} options.levelOffset
   * @param {array} options.paintRules
   * @param {array} options.labelRules
   */
  constructor(options) {
    options = Cesium.defaultValue(options, Cesium.defaultValue.EMPTY_OBJECT);

    this._url = options.url;

    this._tileWidth = Cesium.defaultValue(options.tileWidth, 256);
    this._tileHeight = Cesium.defaultValue(options.tileHeight, 256);
    this._minimumLevel = Cesium.defaultValue(options.minimumLevel, 0);
    this._maximumLevel = Cesium.defaultValue(options.maximumLevel, 25);
    this._maximumNativeLevel = Cesium.defaultValue(
      options.maximumNativeLevel,
      this._maximumLevel
    );

    this._tilingScheme =
      options.tilingScheme || new Cesium.WebMercatorTilingScheme();

    this._rectangle = Cesium.defaultValue(
      options.rectangle,
      this._tilingScheme.rectangle
    );

    this._readyPromise = Cesium.defer();

    const labelersCanvasContext = document
      .createElement("canvas")
      .getContext("2d");

    this._paintRules = Cesium.defaultValue(options.paintRules, []);
    this._labelRules = Cesium.defaultValue(options.labelRules, []);

    this._labelers = new protomapsL.Labelers(
      labelersCanvasContext,
      this._labelRules,
      32,
      () => undefined
    );

    let requestTrailer = Cesium.defaultValue(
      options.requestTrailer,
      "tile/{z}/{y}/{x}.pbf"
    );
    this._source = new protomapsL.ZxySource(
      `${this._url}/${requestTrailer}`,
      false
    );

    this._buf = Cesium.defaultValue(options.buf, 64);
    let tileSize = Cesium.defaultValue(options.tileSize, 256);
    let levelDiff = Cesium.defaultValue(options.levelDiff, 0);
    let cache = new protomapsL.TileCache(this._source, tileSize);
    this._view = new protomapsL.View(
      cache,
      this._maximumNativeLevel,
      levelDiff
    );
    this._debug = Cesium.defaultValue(options.debug, "");
    this._levelOffset = Cesium.defaultValue(options.levelOffset, 0);
  }

  /**
   * 图层服务的url
   * @type {String}
   * @readonly
   */
  get url() {
    return this._url;
  }

  /**
   * 单块瓦片的宽
   * @type {Number}
   * @readonly
   */
  get tileWidth() {
    return this._tileWidth;
  }

  /**
   * 单块瓦片的高
   * @type {Number}
   * @readonly
   */
  get tileHeight() {
    return this._tileHeight;
  }

  /**
   * 最大显示层
   * @type {Number}
   * @readonly
   */
  get maximumLevel() {
    return this._maximumLevel;
  }

  /**
   * 最小显示层
   * @type {Number}
   * @readonly
   */
  get minimumLevel() {
    return this._minimumLevel;
  }

  /**
   * 矢量切片的最大加载层
   * @type {Number}
   * @readonly
   */
  get maximumNativeLevel() {
    return this._maximumNativeLevel;
  }

  /**
   * 当前使用的切片方
   * @type {Cesium.GeographicTilingScheme}
   * @readonly
   */
  get tilingScheme() {
    return this._tilingScheme;
  }

  /**
   * 显示范围
   * @type {Cesium.Rectangle}
   * @readonly
   */
  get rectangle() {
    return this._rectangle;
  }

  get readyPromise() {
    return this._readyPromise.promise;
  }

  get hasAlphaChannel() {
    return true;
  }

  /**
   * ArcGIS矢量切片图层加载
   * @constructor
   * @alias ArcGISPbfImageryProvider
   * @param {Object} options
   * @param {string} options.url                          ArcGIS矢量切片图层服务地址
   * @param {number} options.tileWidth                    切片宽度
   * @param {number} options.tileHeight                   切片高度
   * @param {number} options.minimumLevel=0               最小显示层
   * @param {number} options.maximumLevel=26              最大显示层
   * @param {number} options.maximumNativeLevel=26        矢量切片的最大切片层级
   * @param {Cesium.Rectangle} options.rectangle          显示范围
   * @param {Cesium.TilingScheme} options.tilingScheme
   * @param {string} options.requestTrailer
   * @param {number} options.buf
   * @param {number} options.tileSize
   * @param {number} options.levelDiff
   * @param {string} options.debug
   * @param {number} options.levelOffset
   */
  static async fromUrl(url, options) {
    options = Cesium.defaultValue(options, Cesium.defaultValue.EMPTY_OBJECT);
    let imageryProviderOptions = {};

    let resource = new Cesium.Resource({
      url: url,
      queryParameters: {
        f: "json",
      },
    });
    const resultJson = await resource.fetchJson();

    let styleJson;
    let styleJsonUrl;
    if (resultJson.defaultStyles) {
      if (resultJson.defaultStyles.startsWith("http")) {
        styleJsonUrl = resultJson.defaultStyles;
      } else {
        styleJsonUrl = `${url}/${resultJson.defaultStyles}/root.json`;
      }
      let styleJsonResource = new Cesium.Resource({
        url: styleJsonUrl,
        queryParameters: {
          f: "json",
        },
      });
      imageryProviderOptions.url = url;
      imageryProviderOptions.requestTrailer = resultJson.tiles;

      // 加载style文件
      styleJson = await styleJsonResource.fetchJson();
      console.log(styleJson);
    } else {
      // 当前就是style文件
      styleJson = resultJson;
      if (styleJson.sources?.esri?.url) {
        let sourceUrl;
        if (styleJson.sources.esri.url.startsWith("http")) {
          sourceUrl = styleJson.sources.esri.url;
        } else {
          sourceUrl = styleJsonUrl.replace("root.json", "");
          sourceUrl = sourceUrl + styleJson.sources.esri.url;
        }
        imageryProviderOptions.url = sourceUrl;
      }
      let serverResource = new Cesium.Resource({
        url: imageryProviderOptions.url,
        queryParameters: {
          f: "json",
        },
      });
      const serverJson = await serverResource.fetchJson();
      imageryProviderOptions.requestTrailer = serverJson.tiles;
    }

    // 如果存在范围，则设置范围
    const bounds = styleJson.sources?.esri?.bounds;
    if (bounds && !Cesium.defined(options.rectangle)) {
      // 如果服务中存在ectangle 但是没传在rectangle 则使用服务中定义
      imageryProviderOptions.rectangle = Cesium.Rectangle.fromDegrees(
        bounds[0],
        bounds[1],
        bounds[2],
        bounds[3]
      );
    }

    let spriteUrl;
    if (styleJson.sprite.startsWith("http")) {
      spriteUrl = styleJson.sprite;
    } else {
      spriteUrl = styleJsonUrl.replace("root.json", "");
      spriteUrl = spriteUrl + styleJson.sprite;
    }
    const _isRetina = 1.15 < window.devicePixelRatio;
    if (_isRetina) {
      spriteUrl = `${spriteUrl}@2x`;
    }
    const spriteJsonResource = new Cesium.Resource({
      url: `${spriteUrl}.json`,
      queryParameters: {
        f: "json",
      },
    });

    const image = await loadImage(`${spriteUrl}.png`).catch((error) => {
      throw new Cesium.RuntimeError(error.message);
    });
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = image.width;
    spriteCanvas.height = image.height;
    const spriteCtx = spriteCanvas.getContext("2d");
    spriteCtx.drawImage(image, 0, 0, image.width, image.height);

    const spriteJson = await spriteJsonResource.fetchJson();
    const sheet = new protomapsL.Sheet(spriteJson, spriteCanvas);
    const rules = this._json_style(styleJson, sheet);
    imageryProviderOptions.labelRules = rules.label_rules;
    imageryProviderOptions.paintRules = rules.paint_rules;

    imageryProviderOptions = {
      ...options,
      ...imageryProviderOptions,
    };
    const provider = new CustomProvider(imageryProviderOptions);
    return provider;
  }

  /**
   * Requests the image for a given tile.  This function should
   * not be called before {@link ArcGISPbfImageryProvider#ready} returns true.
   *
   * @param {Number} x The tile X coordinate.
   * @param {Number} y The tile Y coordinate.
   * @param {Number} level The tile level.
   * @returns {Promise.<ImageryTypes>|undefined} A promise for the image that will resolve when the image is available, or
   *          undefined if there are too many active requests to the server, and the request should be retried later.
   *
   * @exception {DeveloperError} <code>requestImage</code> must not be called before the imagery provider is ready.
   */
  requestImage(x, y, level) {
    const canvas = document.createElement("canvas");
    canvas.width = this.tileWidth;
    canvas.height = this.tileHeight;
    try {
      return this._renderTile({ x, y, z: level }, canvas);
    } catch (e) {
      return Promise.resolve(canvas);
    }
  }

  async _renderTile(coords, canvas) {
    if (this._levelOffset) {
      coords.z += this._levelOffset;
    }

    const tile = await this._view.getDisplayTile(coords);
    const tileMap = new Map().set("", [tile]);
    this._labelers.add(coords.z, tileMap);
    let labelData = this._labelers.getIndex(tile.z);
    const bbox = {
      minX: 256 * coords.x - this._buf,
      minY: 256 * coords.y - this._buf,
      maxX: 256 * (coords.x + 1) + this._buf,
      maxY: 256 * (coords.y + 1) + this._buf,
    };
    const origin = new Point(256 * coords.x, 256 * coords.y);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(this._tileWidth / 256, 0, 0, this._tileWidth / 256, 0, 0);
    ctx.clearRect(0, 0, 256, 256);
    if (labelData) {
      protomapsL.paint(
        ctx,
        coords.z,
        tileMap,
        labelData,
        this._paintRules,
        bbox,
        origin,
        false,
        this._debug
      );
    }
    if (this._debug) {
      ctx.save();
      ctx.fillStyle = this._debug;
      ctx.font = "600 12px sans-serif";
      ctx.fillText(coords.z + " " + coords.x + " " + coords.y, 4, 14);
      ctx.font = "12px sans-serif";
      let ypos = 28;
      for (let [k, v] of tileMap) {
        let dt = v[0].data_tile;
        ctx.fillText(
          k + (k ? " " : "") + dt.z + " " + dt.x + " " + dt.y,
          4,
          ypos
        );
        ypos += 14;
      }
      ctx.font = "600 10px sans-serif";
      if (painting_time > 8) {
        ctx.fillText(painting_time.toFixed() + " ms paint", 4, ypos);
        ypos += 14;
      }
      if (layout_time > 8) {
        ctx.fillText(layout_time.toFixed() + " ms layout", 4, ypos);
      }
      ctx.strokeStyle = this._debug;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 256);
      ctx.stroke();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(256, 0);
      ctx.stroke();
      ctx.restore();
    }
    return canvas;
  }

  pickFeatures(x, y, zoom, longitude, latitude) {
    return undefined;
  }
  // 样式解析规则方法【重要】
  static _json_style(obj, sheet) {
    let paint_rules = [];
    let label_rules = [];
    let refs = new Map();

    for (let layer of obj.layers) {
      refs.set(layer.id, layer);

      if (layer.layout && layer.layout.visibility == "none") {
        continue;
      }

      if (layer.ref) {
        let referenced = refs.get(layer.ref);
        layer.type = referenced.type;
        layer.filter = referenced.filter;
        layer.source = referenced["source"];
        layer["source-layer"] = referenced["source-layer"];
      }

      let sourceLayer = layer["source-layer"];

      let filter = undefined;
      if (layer.filter) {
        filter = filterFn(layer.filter);
      }

      // ignore background-color?
      if (layer.type == "fill") {
        const fillPattern = layer.paint["fill-pattern"];
        const fill = layer.paint["fill-color"];
        const opacity = layer.paint["fill-opacity"];
        const outlineColor = layer.paint["fill-outline-color"];
        let pattern;
        if (fillPattern) {
          const patternInfor = sheet.get(fillPattern);
          const canvas = document.createElement("canvas");
          canvas.width = patternInfor.w;
          canvas.height = patternInfor.h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(
            sheet.canvas,
            patternInfor.x,
            patternInfor.y,
            patternInfor.w,
            patternInfor.h,
            0,
            0,
            patternInfor.w,
            patternInfor.h
          );
          // let app = document.getElementById("app");
          // app.appendChild(sheet.canvas);
          // app.appendChild(canvas);
          pattern = canvas;
        }
        // 填充
        paint_rules.push({
          dataLayer: layer["source-layer"],
          filter: filter,
          symbolizer: new protomapsL.PolygonSymbolizer({
            pattern,
            fill,
            opacity,
          }),
        });
      } else if (layer.type == "fill-extrusion") {
        // 用不同的填充来绘制填充挤
        // simulate fill-extrusion with plain fill
        paint_rules.push({
          dataLayer: layer["source-layer"],
          filter: filter,
          symbolizer: new protomapsL.PolygonSymbolizer({
            fill: layer.paint["fill-extrusion-color"],
            opacity: layer.paint["fill-extrusion-opacity"],
          }),
        });
      } else if (layer.type == "line") {
        const lineColorInfor = layer.paint["line-color"];
        let lineColor;
        if (lineColorInfor.stops) {
          lineColor = function (z, f) {
            const stops = lineColorInfor.stops;
            const length = stops.length;
            for (let i = length - 1; i >= 0; i--) {
              if (z < stops[i][0]) {
                return stops[i][1];
              }
            }
            return stops[length - 1][1];
          };
        } else {
          lineColor = lineColorInfor;
        }
        // simulate gap-width
        if (layer.paint["line-dasharray"]) {
          paint_rules.push({
            dataLayer: layer["source-layer"],
            filter: filter,
            symbolizer: new protomapsL.LineSymbolizer({
              width: widthFn(
                layer.paint["line-width"],
                layer.paint["line-gap-width"]
              ),
              dash: layer.paint["line-dasharray"],
              dashColor: lineColor,
            }),
          });
        } else {
          paint_rules.push({
            dataLayer: layer["source-layer"],
            filter: filter,
            symbolizer: new protomapsL.LineSymbolizer({
              color: lineColor,
              width: widthFn(
                layer.paint["line-width"],
                layer.paint["line-gap-width"]
              ),
            }),
          });
        }
      } else if (layer.type == "symbol") {
        let textField = layer.layout["text-field"];
        if (textField) {
          textField = textField.replace("{", "");
          textField = textField.replace("}", "");
        }
        if (layer.layout["symbol-placement"] == "line") {
          if (layer.layout["icon-image"]) {
            console.log(layer);
            let textSymbolizer = new protomapsL.ShieldSymbolizer({
              // FontAttr
              font: getFont(layer.layout),

              // TextAttr
              labelProps: textField ? [textField] : undefined,
              textTransform: layer.layout["text-transform"],

              //
              fill: layer.paint["text-color"],
              stroke: layer.paint["text-halo-color"],
              width: layer.paint["text-halo-width"],
              padding:0,
            });
            let symbolizer = textSymbolizer;

            let iconSymbolizer = new protomapsL.IconSymbolizer({
              name: layer.layout["icon-image"],
              sheet: sheet,
            });

            symbolizer = new protomapsL.GroupSymbolizer([
              iconSymbolizer,
              textSymbolizer,
              // new protomapsL.OffsetSymbolizer(textSymbolizer, {
              //   offsetX: 0,
              //   offsetY: 0,
              //   justify: undefined,
              //   placements: undefined,
              // }),
            ]);

            label_rules.push({
              dataLayer: layer["source-layer"],
              filter: filter,
              symbolizer,
            });
          } else {
            label_rules.push({
              dataLayer: layer["source-layer"],
              filter: filter,
              symbolizer: new protomapsL.LineLabelSymbolizer({
                font: getFont(layer.layout),
                fill: layer.paint["text-color"],
                width: layer.paint["text-halo-width"],
                stroke: layer.paint["text-halo-color"],
                textTransform: layer.layout["text-transform"],
                labelProps: textField ? [textField] : undefined,
              }),
            });
          }
        } else {
          const textAnchor = layer.layout["text-anchor"];
          let justify;
          switch (textAnchor) {
            case "left":
              justify = protomapsL.Justify.Left;
              break;
            case "right":
              justify = protomapsL.Justify.Right;
              break;
            case "center":
              justify = protomapsL.Justify.Center;
              break;
          }

          let textSymbolizer = new protomapsL.TextSymbolizer({
            // FontAttr
            font: getFont(layer.layout),

            // TextAttr
            labelProps: textField ? [textField] : undefined,
            textTransform: layer.layout["text-transform"],

            //
            fill: layer.paint["text-color"],
            stroke: layer.paint["text-halo-color"],
            width: layer.paint["text-halo-width"],
            justify: justify,
          });
          let symbolizer = textSymbolizer;

          if (layer.layout["icon-image"]) {
            let iconSymbolizer = new protomapsL.IconSymbolizer({
              name: layer.layout["icon-image"],
              sheet: sheet,
            });

            symbolizer = new protomapsL.GroupSymbolizer([
              iconSymbolizer,
              textSymbolizer,
            ]);
          }

          let ruleOptions = {
            dataLayer: layer["source-layer"],
            filter: filter,
            symbolizer,
          };
          label_rules.push(ruleOptions);
        }
      } else if (layer.type == "circle") {
        paint_rules.push({
          dataLayer: layer["source-layer"],
          filter: filter,
          symbolizer: new protomapsL.CircleSymbolizer({
            radius: layer.paint["circle-radius"],
            fill: layer.paint["circle-color"],
            stroke: layer.paint["circle-stroke-color"],
            width: layer.paint["circle-stroke-width"],
          }),
        });
      } else if (layer.type === "background") {
      } else if (layer.type === "raster") {
        console.warn(`Unsupported vector tile raster layer`);
        break;
      }
    }

    return { paint_rules: paint_rules, label_rules: label_rules, tasks: [] };
  }
}
export default CustomProvider;
