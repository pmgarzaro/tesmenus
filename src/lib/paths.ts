import path from "node:path";

export const DATA_DIR = path.resolve(
  /*turbopackIgnore: true*/
  process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || "data",
);
