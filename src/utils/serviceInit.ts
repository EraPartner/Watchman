async function initializeServices(): Promise<boolean> {
  try {
    console.log('Initializing backend connection...');
    return true;
  } catch (error) {
    console.error('Service initialization failed:', error);
    return false;
  }
}

export { initializeServices };