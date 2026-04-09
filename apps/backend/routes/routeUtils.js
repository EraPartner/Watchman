export function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function getServiceContext(getServiceManager, serviceName) {
  const serviceManager = getServiceManager();
  const service =
    serviceManager && typeof serviceManager.getService === "function"
      ? serviceManager.getService(serviceName)
      : undefined;

  return {
    serviceManager,
    service,
  };
}
