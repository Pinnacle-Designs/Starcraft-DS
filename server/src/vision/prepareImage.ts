import sharp from "sharp";

export interface PreparedVisionImages {
  viewportBase64: string;
  tileBase64: string[];
}

/** Crop SC2 UI chrome and upscale the gameplay area for vision models. */
export async function prepareVisionImages(
  imageBase64: string
): Promise<PreparedVisionImages> {
  try {
    return await prepareVisionImagesInner(imageBase64);
  } catch {
    return { viewportBase64: imageBase64, tileBase64: [] };
  }
}

async function prepareVisionImagesInner(
  imageBase64: string
): Promise<PreparedVisionImages> {
  const input = Buffer.from(imageBase64, "base64");
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) {
    return { viewportBase64: imageBase64, tileBase64: [] };
  }

  const top = Math.floor(height * 0.06);
  const bottom = Math.floor(height * 0.13);
  const side = Math.floor(width * 0.03);
  const cropWidth = Math.max(32, width - side * 2);
  const cropHeight = Math.max(32, height - top - bottom);

  const viewportBuf = await sharp(input)
    .extract({ left: side, top, width: cropWidth, height: cropHeight })
    .resize({
      width: Math.min(1920, Math.max(1280, cropWidth)),
      withoutEnlargement: false,
    })
    .jpeg({ quality: 93 })
    .toBuffer();

  const tileCols = 2;
  const tileRows = 2;
  const tileW = Math.floor(cropWidth / tileCols);
  const tileH = Math.floor(cropHeight / tileRows);
  const tileBase64: string[] = [];

  for (let row = 0; row < tileRows; row++) {
    for (let col = 0; col < tileCols; col++) {
      const left = side + col * tileW;
      const tileTop = top + row * tileH;
      const w =
        col === tileCols - 1 ? side + cropWidth - left : tileW;
      const h =
        row === tileRows - 1 ? top + cropHeight - tileTop : tileH;
      const tileBuf = await sharp(input)
        .extract({ left, top: tileTop, width: w, height: h })
        .resize({ width: 1024, withoutEnlargement: false })
        .jpeg({ quality: 90 })
        .toBuffer();
      tileBase64.push(tileBuf.toString("base64"));
    }
  }

  return {
    viewportBase64: viewportBuf.toString("base64"),
    tileBase64,
  };
}
