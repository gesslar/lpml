/**
 * @file LPML encoder. A port of lpml_encode() from the Ox mudlib's
 * /adm/simul_efun/lpml.lpc, serializing JavaScript (JSON-compatible) values
 * into human-readable, width-bounded LPML.
 *
 * Differences from the LPC original, all forced by the source being JSON:
 * - Booleans are written as `true`/`false` (LPC has none and writes 1/0).
 * - Numbers with no fractional part are written as ints, since JavaScript
 *   cannot tell `5.0` from `5`.
 * - Key sorting can be turned off to keep insertion order.
 */

const DEFAULT_WIDTH = 79

/**
 * @typedef {object} EncodeOptions
 * @property {number} [width=79] - Maximum line length. A single string with
 *  no safe break point, or a very long key, can still exceed it.
 * @property {boolean} [sortKeys=true] - Sort object keys, as the LPC encoder
 *  does. Set false to keep insertion order.
 */

/**
 * Quotes a string for LPML output. A leading `#` is escaped as `\#` so the
 * decoder does not read the string as a file include.
 *
 * @param {string} str - The string.
 * @returns {string} Double-quoted, escaped string.
 */
function quote(str) {
  str = str
    .replaceAll("\\", "\\\\")
    .replaceAll("\"", "\\\"")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replaceAll("\b", "\\b")
    .replaceAll("\f", "\\f")

  return str.startsWith("#") ? `"\\${str}"` : `"${str}"`
}

/**
 * Formats an object key, bare when the decoder would read it back verbatim
 * and quoted otherwise. A bare key starts with a letter, digit or underscore
 * and continues with letters, digits, underscores, hyphens, dots or single
 * interior spaces.
 *
 * @param {string} key - The key.
 * @returns {string} The key as it should appear before the `:`.
 */
function encodeKey(key) {
  if(!key.length || key.endsWith(" ") || key.includes("  "))
    return quote(key)

  for(let i = 0; i < key.length; i++) {
    const ch = key[i]

    if((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") ||
       (ch >= "0" && ch <= "9") || ch === "_")
      continue

    if(i > 0 && (ch === "-" || ch === "." || ch === " "))
      continue

    return quote(key)
  }

  return key
}

/**
 * Formats a non-integral number as the shortest fixed-point decimal that
 * reads back as the same value, always with a decimal point.
 *
 * @param {number} value - The number.
 * @returns {string} The formatted number.
 */
function encodeFloat(value) {
  for(let precision = 1; precision <= 17; precision++) {
    let out = value.toFixed(precision)

    while(out.endsWith("0") && out.at(-2) !== ".")
      out = out.slice(0, -1)

    if(Number(out) === value)
      return out
  }

  // Too small for fixed-point; exponent notation still decodes as a float.
  return String(value)
}

/**
 * Formats a scalar value.
 *
 * @param {unknown} value - A number, string, boolean, bigint or nullish.
 * @returns {string} The LPML text for the value.
 * @throws {TypeError} For values LPML cannot represent.
 */
function encodeScalar(value) {
  if(value === null || value === undefined)
    return "null"

  switch(typeof value) {
    case "boolean":
      return String(value)
    case "bigint":
      return value.toString()
    case "string":
      return quote(value)
    case "number":
      if(!Number.isFinite(value))
        return "null"

      return Number.isInteger(value)
        ? BigInt(value).toString()
        : encodeFloat(value)
  }

  throw new TypeError(`lpml encode: cannot represent ${typeof value}`)
}

/**
 * Finds positions where a string can be split into adjacent LPML literals
 * without changing its decoded value: right after a `\n`, or on a single
 * space with non-space, non-newline neighbours (the decoder restores it).
 *
 * @param {string} str - The string.
 * @returns {Array<[number, number]>} Pairs of [splitIndex, charsToSkip].
 */
function breaksOf(str) {
  const breaks = []
  const len = str.length

  for(let i = 0; i < len; i++) {
    const ch = str[i]

    if(ch === "\n" && i + 1 < len)
      breaks.push([i + 1, 0])
    else if(ch === " " && i > 0 && i < len - 1 &&
            str[i - 1] !== " " && str[i - 1] !== "\n" && str[i + 1] !== " ")
      breaks.push([i, 1])
  }

  return breaks
}

/**
 * Splits a string into quoted chunks that fit the width, greedily.
 *
 * @param {string} str - The string.
 * @param {number} firstCol - Column the first chunk starts at.
 * @param {number} contCol - Column continuation chunks start at.
 * @param {number} tailLen - Length of text following the last chunk.
 * @param {number} width - Maximum line length.
 * @returns {Array<string>} The quoted chunks, in order.
 */
function wrap(str, firstCol, contCol, tailLen, width) {
  const whole = quote(str)

  if(firstCol + whole.length + tailLen <= width)
    return [whole]

  const breaks = breaksOf(str)
  const chunks = []
  let start = 0
  let col = firstCol

  for(;;) {
    const rest = quote(str.slice(start))

    if(col + rest.length + tailLen <= width) {
      chunks.push(rest)
      break
    }

    let best = null

    for(const brk of breaks) {
      if(brk[0] <= start)
        continue

      if(col + quote(str.slice(start, brk[0])).length > width) {
        best ??= brk
        break
      }

      best = brk
    }

    if(!best) {
      chunks.push(rest)
      break
    }

    chunks.push(quote(str.slice(start, best[0])))
    start = best[0] + best[1]
    col = contCol
  }

  return chunks
}

const isContainer = value => value !== null && typeof value === "object"

/** Serializer state for one encode() call. */
class Encoder {
  /**
   * Creates an encoder for the given options.
   *
   * @param {EncodeOptions} options - Encode options.
   */
  constructor(options) {
    this.width = options.width > 0 ? options.width : DEFAULT_WIDTH
    this.sortKeys = options.sortKeys ?? true
  }

  keys(obj) {
    const keys = Object.keys(obj)

    return this.sortKeys ? keys.sort() : keys
  }

  inline(value) {
    if(!isContainer(value))
      return encodeScalar(value)

    if(Array.isArray(value))
      return `[${value.map(v => this.inline(v)).join(", ")}]`

    const keys = this.keys(value)

    if(!keys.length)
      return "{}"

    const parts = keys.map(k => `${encodeKey(k)}: ${this.inline(value[k])}`)

    return `{ ${parts.join(", ")} }`
  }

  /**
   * Formats a value as one or more lines. Containers stay on one line when
   * they fit, otherwise expand one entry per line with trailing commas.
   *
   * @param {unknown} value - The value.
   * @param {number} indent - Indent of the line holding this value.
   * @param {string} head - Text already on the line (indent + `key: `).
   * @param {string} tail - Text after the value (`,` or empty).
   * @returns {Array<string>} The lines.
   */
  lines(value, indent, head, tail) {
    const col = head.length

    if(typeof value === "string") {
      const cont = col <= 40 ? col : indent + 2
      const chunks = wrap(value, col, cont, tail.length, this.width)
      const lines = [head + chunks[0]]

      for(const chunk of chunks.slice(1))
        lines.push(" ".repeat(cont) + chunk)

      lines[lines.length - 1] += tail

      return lines
    }

    if(!isContainer(value))
      return [head + encodeScalar(value) + tail]

    const text = this.inline(value)

    if(col + text.length + tail.length <= this.width)
      return [head + text + tail]

    const pad = " ".repeat(indent + 2)
    const isArray = Array.isArray(value)
    const lines = [head + (isArray ? "[" : "{")]

    if(isArray) {
      for(const element of value)
        lines.push(...this.lines(element, indent + 2, pad, ","))
    } else {
      for(const key of this.keys(value))
        lines.push(...this.lines(value[key], indent + 2, `${pad}${encodeKey(key)}: `, ","))
    }

    lines.push(" ".repeat(indent) + (isArray ? "]" : "}") + tail)

    return lines
  }
}

/**
 * Normalizes input the way JSON.stringify would see it (toJSON(), boxed
 * primitives) and rejects circular references.
 *
 * @param {unknown} value - The value.
 * @param {Array<object>} stack - Ancestors, for cycle detection.
 * @param {string} where - Path to the value, for error messages.
 * @returns {unknown} A plain value tree.
 */
function normalize(value, stack = [], where = "$") {
  if(isContainer(value) && typeof value.toJSON === "function")
    value = value.toJSON()

  if(value instanceof Number || value instanceof String ||
     value instanceof Boolean)
    value = value.valueOf()

  if(!isContainer(value))
    return value

  if(stack.includes(value))
    throw new TypeError(`lpml encode: circular reference at ${where}`)

  stack.push(value)

  let out

  if(Array.isArray(value)) {
    // Array.from visits holes as undefined, so sparse arrays encode as null.
    out = Array.from(value, (v, i) => normalize(v, stack, `${where}[${i}]`))
  } else {
    out = {}

    for(const [k, v] of Object.entries(value)) {
      Object.defineProperty(out, k, {
        value: normalize(v, stack, `${where}.${k}`),
        enumerable: true, writable: true, configurable: true,
      })
    }
  }

  stack.pop()

  return out
}

/**
 * Serializes a JavaScript value into human-readable LPML: unquoted keys
 * where safe, sorted keys, trailing commas, containers expanded only when
 * they overflow, and long strings wrapped with LPML string concatenation so
 * the decoded value is unchanged.
 *
 * BigInts are written exactly (useful for 64-bit LPC ints), but decode()
 * returns Numbers, so one beyond Number.MAX_SAFE_INTEGER will not survive a
 * JavaScript round trip.
 *
 * @param {unknown} value - The value to serialize.
 * @param {EncodeOptions|number} [options] - Options, or just the width.
 * @returns {string} The LPML text, newline-terminated.
 * @throws {TypeError} On circular references or unrepresentable values
 *  (functions, symbols).
 * @example
 * encode({ name: "cave bat", level: [1, 3] })
 * // => '{ level: [1, 3], name: "cave bat" }\n'
 */
export function encode(value, options = {}) {
  if(typeof options === "number")
    options = {width: options}

  const encoder = new Encoder(options)

  return `${encoder.lines(normalize(value), 0, "", "").join("\n")}\n`
}
