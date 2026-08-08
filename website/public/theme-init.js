(function () {
  var theme = "light";
  try {
    if (window.localStorage.getItem("ss-site-theme") === "dark") theme = "dark";
  } catch (error) {
    // Keep the safe light-theme default when storage is unavailable.
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
