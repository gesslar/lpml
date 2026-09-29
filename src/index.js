/**
 * @file LPML (LPC Markup Language) for JavaScript. Decode LPML to plain
 * JSON-compatible values and encode them back, matching the behaviour of
 * the Ox mudlib's lpml_decode()/lpml_encode() simul_efuns.
 */

export {decode, decodeFile, LpmlSyntaxError, LPC_MAX_INT, LPC_MAX_FLOAT} from "./decode.js"
export {encode} from "./encode.js"
