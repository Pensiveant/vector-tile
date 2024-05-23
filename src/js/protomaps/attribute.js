export class StringAttr {
  str;
  perFeature;

  constructor(c, defaultValue) {
    this.str = c ?? defaultValue;
    this.perFeature = typeof this.str === "function" && this.str.length === 2;
  }

  get(z, f) {
    if (typeof this.str === "function") {
      return this.str(z, f);
    }
    return this.str;
  }
}

export class NumberAttr {
  value;
  perFeature;

  constructor(c, defaultValue = 1) {
    this.value = c ?? defaultValue;
    this.perFeature =
      typeof this.value === "function" && this.value.length === 2;
  }

  get(z, f) {
    if (typeof this.value === "function") {
      return this.value(z, f);
    }
    return this.value;
  }
}

export class TextAttr {
  labelProps;
  textTransform;

  constructor(options) {
    this.labelProps = options?.labelProps ?? ["name"];
    this.textTransform = options?.textTransform;
  }

  get(z, f) {
    let retval;

    let labelProps;
    if (typeof this.labelProps === "function") {
      labelProps = this.labelProps(z, f);
    } else {
      labelProps = this.labelProps;
    }
    for (const property of labelProps) {
      if (
        Object.prototype.hasOwnProperty.call(f.props, property) &&
        typeof f.props[property] === "string"
      ) {
        retval = f.props[property];
        break;
      }
    }
    let transform;
    if (typeof this.textTransform === "function") {
      transform = this.textTransform(z, f);
    } else {
      transform = this.textTransform;
    }
    if (retval && transform === "uppercase") retval = retval.toUpperCase();
    else if (retval && transform === "lowercase") retval = retval.toLowerCase();
    else if (retval && transform === "capitalize") {
      const wordsArray = retval.toLowerCase().split(" ");
      const capsArray = wordsArray.map((word) => {
        return word[0].toUpperCase() + word.slice(1);
      });
      retval = capsArray.join(" ");
    }
    return retval;
  }
}

export class FontAttr {
  family;
  size;
  weight;
  style;
  font;

  constructor(options) {
    if (options?.font) {
      this.font = options.font;
    } else {
      this.family = options?.fontFamily ?? "sans-serif";
      this.size = options?.fontSize ?? 12;
      this.weight = options?.fontWeight;
      this.style = options?.fontStyle;
    }
  }

  get(z, f) {
    if (this.font) {
      if (typeof this.font === "function") {
        return this.font(z, f);
      }
      return this.font;
    }
    let style = "";
    if (this.style) {
      if (typeof this.style === "function") {
        style = `${this.style(z, f)} `;
      } else {
        style = `${this.style} `;
      }
    }

    let weight = "";
    if (this.weight) {
      if (typeof this.weight === "function") {
        weight = `${this.weight(z, f)} `;
      } else {
        weight = `${this.weight} `;
      }
    }

    let size;
    if (typeof this.size === "function") {
      size = this.size(z, f);
    } else {
      size = this.size;
    }

    let family;
    if (typeof this.family === "function") {
      family = this.family(z, f);
    } else {
      family = this.family;
    }

    return `${style}${weight}${size}px ${family}`;
  }
}

export class ArrayAttr {
  value;
  perFeature;

  constructor(c, defaultValue) {
    this.value = c ?? defaultValue;
    this.perFeature =
      typeof this.value === "function" && this.value.length === 2;
  }

  get(z, f) {
    if (typeof this.value === "function") {
      return this.value(z, f);
    }
    return this.value;
  }
}
