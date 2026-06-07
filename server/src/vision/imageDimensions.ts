/** Read width/height from JPEG/PNG buffers without extra dependencies. */
export function imageDimensionsFromBase64(
  imageBase64: string,
  mimeType: string
): { width: number; height: number } | null {
  const buf = Buffer.from(imageBase64, "base64");
  if (buf.length < 24) return null;

  if (mimeType.includes("png") || buf[0] === 0x89) {
    if (buf.toString("ascii", 1, 4) !== "PNG") return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  let i = 0;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      };
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }

  return null;
}
