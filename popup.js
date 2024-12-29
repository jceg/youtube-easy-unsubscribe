let currentProgress = {
  isUnsubscribing: false,
  current: 0,
  total: 0
};

function createRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  const rect = button.getBoundingClientRect();

  const diameter = Math.max(button.clientWidth, button.clientHeight);
  const radius = diameter / 2;

  ripple.style.width = ripple.style.height = `${diameter}px`;
  ripple.style.left = `${event.clientX - rect.left - radius}px`;
  ripple.style.top = `${event.clientY - rect.top - radius}px`;
  ripple.className = 'button-ripple';

  button.appendChild(ripple);

  ripple.addEventListener('animationend', () => {
      ripple.remove();
  });
}

function updateProgressUI(data) {
  const progressContainer = document.querySelector('.progress-container');
  const progressFill = document.querySelector('.progress-fill');
  const progressCount = document.getElementById('progress-count');
  const totalCount = document.getElementById('total-count');
  
  if (data.show) {
      progressContainer.style.display = 'block';
  }
  
  progressCount.textContent = data.current;
  totalCount.textContent = data.total;
  progressFill.style.width = `${(data.current / data.total) * 100}%`;
}

function showCompletion() {
  document.querySelector('.progress-container').style.display = 'none';
  document.querySelector('.completion-message').style.display = 'block';
  
  setTimeout(() => {
      document.querySelector('.completion-message').style.display = 'none';
  }, 3000);
}

async function checkSavedChannels() {
  try {
      const response = await chrome.runtime.sendMessage({ action: 'getQueue' });
      if (response.queue && response.queue.length > 0) {
          document.querySelector('.saved-channels').style.display = 'block';
          document.getElementById('savedCount').textContent = response.queue.length;
      }
  } catch (error) {
      console.log('Error checking saved channels:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  checkSavedChannels();
  
  // Check for pending completion message
  chrome.storage.local.get(['completionPending', 'completionTimestamp'], (result) => {
      if (result.completionPending) {
          const timeSinceCompletion = Date.now() - (result.completionTimestamp || 0);
          // Show completion message if it completed within the last minute
          if (timeSinceCompletion < 60000) {
              showCompletion();
          }
          chrome.storage.local.remove(['completionPending', 'completionTimestamp']);
      }
  });
  
  try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
          chrome.tabs.sendMessage(tab.id, { action: 'getProgress' }, (response) => {
              if (chrome.runtime.lastError) {
                  console.log('Tab not ready:', chrome.runtime.lastError);
                  return;
              }
              if (response && response.isUnsubscribing) {
                  updateProgressUI({
                      show: true,
                      current: response.current,
                      total: response.total
                  });
              }
          });
      }
  } catch (error) {
      console.log('Error checking progress:', error);
  }
});

document.getElementById('toggleMode').addEventListener('click', async (e) => {
  createRipple(e);
  try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, {action: 'toggleMode'});
  } catch (error) {
      console.log('Error toggling mode:', error);
  }
});

document.getElementById('unsubscribe').addEventListener('click', async (e) => {
  createRipple(e);
  try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, {action: 'unsubscribeSelected'});
  } catch (error) {
      console.log('Error starting unsubscribe:', error);
  }
});

document.getElementById('processSaved').addEventListener('click', async (e) => {
  createRipple(e);
  try {
      await chrome.runtime.sendMessage({ action: 'processSaved' });
      document.querySelector('.saved-channels').style.display = 'none';
  } catch (error) {
      console.log('Error processing saved channels:', error);
  }
});

// Update count when popup opens
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getSelectedCount'}, (response) => {
          if (chrome.runtime.lastError) {
              console.log('Tab not ready:', chrome.runtime.lastError);
              return;
          }
          if (response && response.count !== undefined) {
              document.getElementById('selectedCount').textContent = response.count;
          }
      });
  }
});

// Listen for count updates and progress
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateCount') {
      document.getElementById('selectedCount').textContent = message.count;
  } else if (message.action === 'updateProgress') {
      currentProgress = {
          isUnsubscribing: true,
          current: message.data.current,
          total: message.data.total
      };
      updateProgressUI(message.data);
  } else if (message.action === 'showCompletion') {
      currentProgress.isUnsubscribing = false;
      showCompletion();
  }
  return true;
});