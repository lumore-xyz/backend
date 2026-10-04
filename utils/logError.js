export const logError = (context, error) => {
  console.error(context, {
    name: error?.name,
    code: error?.code,
    status: error?.statusCode || error?.status || error?.response?.status,
  });
};
