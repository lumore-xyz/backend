import mongoose from "mongoose";

const UNSUPPORTED_TRANSACTION_MESSAGE_PATTERNS = [
  "transaction numbers are only allowed on a replica set member or mongos",
  "transaction support is not available",
  "only servers in a sharded cluster can start a new transaction at the active transaction number",
  "only server in a shared cluster can start a new transaction at the active transaction number",
];

export const isTransactionUnsupportedError = (error) => {
  const message = String(error?.message || "").toLowerCase();

  if (
    UNSUPPORTED_TRANSACTION_MESSAGE_PATTERNS.some((pattern) =>
      message.includes(pattern),
    )
  ) {
    return true;
  }

  return (
    message.includes("active transaction number") &&
    message.includes("start a new transaction")
  );
};

export async function runInTransaction(work, options = {}) {
  const {
    fallback = null,
    shouldFallback = isTransactionUnsupportedError,
    transactionOptions = undefined,
  } = options;

  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    session.startTransaction(transactionOptions);
    transactionStarted = true;

    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (transactionStarted && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        if (!shouldFallback(error)) {
          error.abortTransactionError = abortError;
        }
      }
    }

    if (fallback && shouldFallback(error)) {
      return await fallback(error);
    }

    throw error;
  } finally {
    try {
      await session.endSession();
    } catch (endSessionError) {
      console.error("[transaction] failed to end session", {
        message: endSessionError?.message || "unknown_error",
      });
    }
  }
}
