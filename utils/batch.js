const DEFAULT_BATCH_SIZE = 100;

export const getBatchSize = (environmentVariable) => {
  const parsed = Number.parseInt(process.env[environmentVariable] || "", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_BATCH_SIZE;
};

export const mapInBatches = async (items, batchSize, mapItem) => {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError("batchSize must be a positive integer");
  }

  const results = [];
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const batch = items.slice(offset, offset + batchSize);
    results.push(...(await Promise.all(batch.map(mapItem))));
  }
  return results;
};
