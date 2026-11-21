document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/ui/dashboard/dashboard.html') });
  window.close();
});

document.getElementById('open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
