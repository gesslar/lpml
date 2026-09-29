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
export type EncodeOptions = {
    /**
     * - Maximum line length. A single string with
     * no safe break point, or a very long key, can still exceed it.
     */
    width?: number;
    /**
     * - Sort object keys, as the LPC encoder
     * does. Set false to keep insertion order.
     */
    sortKeys?: boolean;
};
/**
 * Serializes a JavaScript value into human-readable LPML: unquoted keys
 * where safe, sorted keys, trailing commas, containers expanded only when
 * they overflow, and long strings wrapped with LPML string concatenation so
 * the decoded value is unchanged.
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
export declare function encode(value: unknown, options?: EncodeOptions | number): string;
//# sourceMappingURL=encode.d.ts.map