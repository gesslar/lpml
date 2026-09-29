/**
 * @file LPML decoder. A port of lpml_decode() from the Ox mudlib's
 * /adm/simul_efun/lpml.lpc, producing plain JavaScript (JSON-compatible)
 * values.
 *
 * Differences from the LPC original, all forced by the target being JSON:
 * - `true`/`false` decode to booleans rather than 1/0.
 * - `null`, `undefined`, `Infinity` and `NaN` decode to `null`.
 * - `MAX_INT`/`MAX_FLOAT` decode to configurable numbers (see
 *   {@link DecodeOptions}).
 */
/** FluffOS MAX_INT (LONG_MAX). Not exactly representable as a Number. */
export declare const LPC_MAX_INT = 9223372036854776000;
/** FluffOS MAX_FLOAT (DBL_MAX). */
export declare const LPC_MAX_FLOAT: number;
export type DecodeOptions = {
    /**
     * - Directory used to resolve relative
     * `"#./path"` includes. Mirrors the LPC `base_path` argument. A native
     * path, or a mudlib path (e.g. `/adm/etc`) when `root` is set.
     */
    basePath?: string;
    /**
     * - Mudlib root. When set, include paths are
     * mudlib paths resolved exactly as the LPC implementation does, and
     * absolute ones (`"#/adm/etc/x.lpml"`) are read from under this
     * directory. When unset, include paths are native filesystem paths.
     */
    root?: string;
    /**
     * - Whether to process `"#path"`
     * includes at all.
     */
    includes?: boolean;
    /**
     * - Custom
     * include reader, given the resolved path. Return a nullish
     * value when the file does not exist.
     */
    readFile?: (file: string) => (string | null | undefined);
    /**
     * - Value for `MAX_INT`.
     */
    maxInt?: number;
    /**
     * - Value for `MAX_FLOAT`.
     */
    maxFloat?: number;
};
/**
 * @typedef {object} DecodeOptions
 * @property {string} [basePath] - Directory used to resolve relative
 *  `"#./path"` includes. Mirrors the LPC `base_path` argument. A native
 *  path, or a mudlib path (e.g. `/adm/etc`) when `root` is set.
 * @property {string} [root] - Mudlib root. When set, include paths are
 *  mudlib paths resolved exactly as the LPC implementation does, and
 *  absolute ones (`"#/adm/etc/x.lpml"`) are read from under this
 *  directory. When unset, include paths are native filesystem paths.
 * @property {boolean} [includes=true] - Whether to process `"#path"`
 *  includes at all.
 * @property {(file: string) => (string|null|undefined)} [readFile] - Custom
 *  include reader, given the resolved path. Return a nullish
 *  value when the file does not exist.
 * @property {number} [maxInt=Number.MAX_SAFE_INTEGER] - Value for `MAX_INT`.
 * @property {number} [maxFloat=Number.MAX_VALUE] - Value for `MAX_FLOAT`.
 */
/** Error thrown for malformed LPML. */
export declare class LpmlSyntaxError extends SyntaxError {
    line: number;
    column: number;
    /**
     * Creates a syntax error carrying the source position.
     *
     * @param {string} message - Error description.
     * @param {number} line - 1-based line.
     * @param {number} column - 1-based column.
     */
    constructor(message: string, line: number, column: number);
}
export type IncludeContext = {
    /**
     * - Include reader.
     */
    read: (file: string) => (string | null | undefined);
    /**
     * - Resolves an
     * include path against the including file's directory.
     */
    resolve: (file: string, base: string) => string;
    /**
     * - Directory of a resolved
     * include, used as the base for its own includes.
     */
    dirname: (file: string) => string;
};
/**
 * Deserializes LPML text into a JavaScript value.
 *
 * @param {string} text - LPML source.
 * @param {DecodeOptions} [options] - Decode options.
 * @returns {unknown} The decoded value.
 * @throws {LpmlSyntaxError} On malformed input.
 * @example
 * decode(`{ name: "cave bat", level: [1, 3], }`)
 * // => { name: "cave bat", level: [1, 3] }
 */
export declare function decode(text: string, options?: DecodeOptions): unknown;
/**
 * Reads and decodes an LPML file. Relative includes resolve against the
 * file's directory unless `basePath` is given. When `root` is given, the
 * file is expected to live under it and includes are treated as mudlib
 * paths.
 *
 * @param {string} file - Path to the LPML file.
 * @param {DecodeOptions} [options] - Decode options.
 * @returns {unknown} The decoded value.
 */
export declare function decodeFile(file: string, options?: DecodeOptions): unknown;
//# sourceMappingURL=decode.d.ts.map