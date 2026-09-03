export async function sha256BytesHex(bytes: ArrayBuffer) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesStartWith(bytes: Uint8Array, expected: number[], offset = 0) {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  return expected.every((value, index) => bytes[offset + index] === value);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number) {
  let result = "";

  for (let index = offset; index < offset + length && index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[index]!);
  }

  return result;
}

function isoBmffBrands(bytes: Uint8Array) {
  if (bytes.length < 12 || asciiAt(bytes, 4, 4) !== "ftyp") {
    return [];
  }

  const brands = [asciiAt(bytes, 8, 4)];

  const end = Math.min(bytes.length, 128);

  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(asciiAt(bytes, offset, 4));
  }

  return brands;
}

export function portalMediaSignatureMatches(mime: string, value: ArrayBuffer) {
  const bytes = new Uint8Array(value);

  if (mime === "image/jpeg") {
    return bytesStartWith(bytes, [0xff, 0xd8, 0xff]);
  }

  if (mime === "image/png") {
    return bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }

  if (mime === "image/webp") {
    return asciiAt(bytes, 0, 4) === "RIFF" && asciiAt(bytes, 8, 4) === "WEBP";
  }

  if (mime === "video/webm") {
    return bytesStartWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }

  const brands = isoBmffBrands(bytes);

  if (brands.length === 0) {
    return false;
  }

  const normalizedBrands = brands.map((brand) => brand.toLowerCase());

  if (mime === "image/heic") {
    return normalizedBrands.some((brand) =>
      ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"].includes(brand),
    );
  }

  if (mime === "video/quicktime") {
    return brands.includes("qt  ");
  }

  if (mime === "video/mp4") {
    const mp4Brands = new Set([
      "isom",
      "iso2",
      "iso3",
      "iso4",
      "iso5",
      "iso6",
      "mp41",
      "mp42",
      "avc1",
      "dash",
      "m4v ",
      "f4v ",
      "3gp4",
      "3gp5",
    ]);

    return normalizedBrands.some((brand) => mp4Brands.has(brand));
  }

  return false;
}

export function portalMediaExtension(mime: string) {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return "bin";
  }
}

export async function cleanupPortalMedia(bucket: R2Bucket | null, keys: string[]) {
  if (!bucket || keys.length === 0) {
    return;
  }

  for (const mediaKey of keys) {
    try {
      await bucket.delete(mediaKey);
    } catch {
      // Best-effort compensation for an R2 write that has no
      // corresponding committed D1 attachment row.
    }
  }
}
