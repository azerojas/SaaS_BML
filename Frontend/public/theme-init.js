// Apply before styles and Angular load to avoid flashing the opposite theme.
(() => {
  let preference = null;
  try {
    preference = localStorage.getItem('lasheo-theme');
  } catch {
    // A blocked storage must not prevent the app from loading.
  }
  document.documentElement.dataset.theme =
    preference === 'dark' || preference === 'light'
      ? preference
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
})();
