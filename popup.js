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
    
    // Mark step 3 as completed
    stepStates.step3Completed = true;
    stepStates.isUnsubscribing = false;
    updateStepStatus();
    
    // Extend popup height to accommodate completion message
    document.body.style.minHeight = '620px';

    setTimeout(() => {
        document.querySelector('.completion-message').style.display = 'none';
        // Reset popup height
        document.body.style.minHeight = '580px';
        // Ephemeral checkmarks: clear step 2 and 3 after display so next session starts fresh
        stepStates.step2Completed = false;
        stepStates.step3Completed = false;
        stepStates.isUnsubscribing = false;
        saveStepStates();
        updateStepStatus();
    }, 5000); // Increased time to 5 seconds
}

async function checkSavedChannels() {
    try {
        const response = await chrome.runtime.sendMessage({action: 'getQueue'});
        if (response.queue && response.queue.length > 0) {
            document.querySelector('.saved-channels').style.display = 'block';
            document.getElementById('savedCount').textContent = response.queue.length;
            
            // If we have pending channels, mark step 2 as completed since channels were already selected
            if (!stepStates.isUnsubscribing) {
                stepStates.step2Completed = true;
                saveStepStates();
                updateStepStatus();
            }
        } else {
            document.querySelector('.saved-channels').style.display = 'none';
        }
    } catch (error) {
        console.log('Error checking saved channels:', error);
    }
}

// Track step states
let stepStates = {
    step1Completed: false,
    step2Completed: false,
    step3Completed: false,
    isUnsubscribing: false
};

// Function to update step status based on current page and selection state
async function updateStepStatus() {
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        const step1 = document.querySelector('.step-1');
        const step2 = document.querySelector('.step-2');
        const step3 = document.querySelector('.step-3');
        const openSubsBtn = document.getElementById('openSubscriptions');
        const selectedCountElement = document.getElementById('selectedCount');
        const selectedCount = parseInt(selectedCountElement?.textContent || '0');
        
        // If there is no active work and nothing selected, clear any stale completed flags
        if (!currentProgress.isUnsubscribing && selectedCount === 0) {
            stepStates.step2Completed = false;
            stepStates.step3Completed = false;
            stepStates.isUnsubscribing = false;
            saveStepStates();
        }
        
        // Remove all status classes first
        [step1, step2, step3].forEach(step => {
            step?.classList.remove('active', 'completed', 'disabled');
        });
        
        if (tab && tab.url) {
            if (tab.url.includes('youtube.com/feed/channels')) {
                // User is on subscriptions page - complete step 1
                step1.classList.add('completed');
                stepStates.step1Completed = true;
                openSubsBtn.textContent = 'Already on Subscriptions Page';
                openSubsBtn.disabled = true;
                openSubsBtn.style.opacity = '0.6';
                
                // Check step progression
                if (stepStates.step3Completed) {
                    // All done
                    step2.classList.add('completed');
                    step3.classList.add('completed');
                } else if (stepStates.isUnsubscribing) {
                    // Currently unsubscribing
                    step2.classList.add('completed');
                    step3.classList.add('active');
                } else if (selectedCount > 0) {
                    // Channels selected - ready for step 3
                    step2.classList.add('active');
                    step3.classList.add('active');
                } else {
                    // No channels selected - stay on step 2
                    step2.classList.add('active');
                    step3.classList.add('disabled');
                }
            } else if (tab.url.includes('youtube.com')) {
                // User is on YouTube but not subscriptions page
                step1.classList.add('active');
                step2.classList.add('disabled');
                step3.classList.add('disabled');
                openSubsBtn.textContent = 'Open Subscriptions Page';
                openSubsBtn.disabled = false;
                openSubsBtn.style.opacity = '1';
            } else {
                // User is not on YouTube
                step1.classList.add('active');
                step2.classList.add('disabled');
                step3.classList.add('disabled');
                openSubsBtn.textContent = 'Open Subscriptions Page';
                openSubsBtn.disabled = false;
                openSubsBtn.style.opacity = '1';
            }
        }
    } catch (error) {
        console.log('Error updating step status:', error);
    }
}

// Note: Chrome extension popups may close when creating new tabs
// We'll handle this by using same-tab navigation when possible

// Store step states in chrome storage for persistence
async function saveStepStates() {
    try {
        await chrome.storage.local.set({ stepStates });
    } catch (error) {
        console.log('Error saving step states:', error);
    }
}

async function loadStepStates() {
    try {
        const result = await chrome.storage.local.get(['stepStates']);
        if (result.stepStates) {
            stepStates = { ...stepStates, ...result.stepStates };
        }
    } catch (error) {
        console.log('Error loading step states:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize support accordion
    await initializeSupportAccordion();
    // Listen for accordion state changes from other tabs
    setupAccordionSync();
    await loadStepStates();
    checkSavedChannels();
    updateStepStatus();
    
    // Periodically check for saved channels to keep the card visible across tabs
    setInterval(checkSavedChannels, 5000); // Check every 5 seconds
    
    // Side panel opens automatically via openPanelOnActionClick behavior
    // No need to manually trigger it here

    // Add event listener for Open Subscriptions button
    document.getElementById('openSubscriptions')?.addEventListener('click', async (e) => {
        if (e.target.disabled) return;
        
        // Find the main browser window (not this popup) and navigate there
        try {
            const windows = await chrome.windows.getAll({ populate: true });
            let mainTab = null;
            
            // Look for a normal browser window (not popup)
            for (const window of windows) {
                if (window.type === 'normal' && window.tabs) {
                    // Find the most recently active tab in normal windows
                    for (const tab of window.tabs) {
                        if (!mainTab || tab.active) {
                            mainTab = tab;
                            if (tab.active) break; // Prefer active tab
                        }
                    }
                }
            }
            
            if (mainTab) {
                await chrome.tabs.update(mainTab.id, { 
                    url: 'https://www.youtube.com/feed/channels',
                    active: true 
                });
                // Focus the window containing that tab
                await chrome.windows.update(mainTab.windowId, { focused: true });
                console.log('Navigated to subscriptions page in main window');
            } else {
                // Fallback: create new tab in a new window
                await chrome.windows.create({ 
                    url: 'https://www.youtube.com/feed/channels',
                    type: 'normal'
                });
            }
        } catch (error) {
            console.log('Error navigating to subscriptions:', error);
        }
    });

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
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab) {
            chrome.tabs.sendMessage(tab.id, {action: 'getProgress'}, (response) => {
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
        if (tab && tab.url && tab.url.includes('youtube.com/feed/channels')) {
            chrome.tabs.sendMessage(tab.id, {action: 'toggleMode'});
            console.log('Toggle mode message sent');
        } else {
            console.log('Not on YouTube subscriptions page');
        }
    } catch (error) {
        console.log('Error toggling mode:', error);
    }
});

document.getElementById('unsubscribe').addEventListener('click', async (e) => {
    createRipple(e);
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab && tab.url && tab.url.includes('youtube.com/feed/channels')) {
            // Mark step 2 as completed and step 3 as active
            stepStates.step2Completed = true;
            stepStates.isUnsubscribing = true;
            updateStepStatus();
            
            chrome.tabs.sendMessage(tab.id, {action: 'unsubscribeSelected'});
            console.log('Unsubscribe message sent');
        } else {
            console.log('Not on YouTube subscriptions page');
        }
    } catch (error) {
        console.log('Error starting unsubscribe:', error);
    }
});

document.getElementById('processSaved').addEventListener('click', async (e) => {
    createRipple(e);
    try {
        // First, open/navigate to YouTube subscriptions page
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (!tab.url || !tab.url.includes('youtube.com/feed/channels')) {
            // Navigate to subscriptions page first
            await chrome.tabs.update(tab.id, { 
                url: 'https://www.youtube.com/feed/channels'
            });
            
            // Wait a moment for the page to load before processing
            setTimeout(async () => {
                try {
                    await chrome.runtime.sendMessage({action: 'processSaved'});
                    document.querySelector('.saved-channels').style.display = 'none';
                    
                    // Update step states to show we're resuming
                    // Step 1 is completed (we navigated to subscriptions page)
                    stepStates.step1Completed = true;
                    // Step 2 is completed (channels were already selected)
                    stepStates.step2Completed = true;
                    // Step 3 is now active (we're unsubscribing)
                    stepStates.isUnsubscribing = true;
                    updateStepStatus();
                    saveStepStates();
                    
                    console.log('Resumed unsubscription process');
                } catch (error) {
                    console.log('Error resuming unsubscription:', error);
                }
            }, 2000); // Wait 2 seconds for page load
        } else {
            // Already on subscriptions page, process immediately
            await chrome.runtime.sendMessage({action: 'processSaved'});
            document.querySelector('.saved-channels').style.display = 'none';
            
            // Update step states to show we're resuming
            // Step 1 is completed (we're on subscriptions page)
            stepStates.step1Completed = true;
            // Step 2 is completed (channels were already selected)
            stepStates.step2Completed = true;
            // Step 3 is now active (we're unsubscribing)
            stepStates.isUnsubscribing = true;
            updateStepStatus();
            saveStepStates();
            
            console.log('Resumed unsubscription process');
        }
    } catch (error) {
        console.log('Error processing saved channels:', error);
    }
});

document.getElementById('dismissSaved').addEventListener('click', async (e) => {
    createRipple(e);
    try {
        // Clear the saved queue in background
        await chrome.runtime.sendMessage({action: 'clearQueue'});
        
        // Hide the saved channels message
        document.querySelector('.saved-channels').style.display = 'none';
        
        // Reset step states to allow fresh start
        stepStates.step2Completed = false;
        stepStates.step3Completed = false;
        stepStates.isUnsubscribing = false;
        updateStepStatus();
        saveStepStates();
        
        console.log('Dismissed pending unsubscriptions - ready for fresh start');
    } catch (error) {
        console.log('Error dismissing saved channels:', error);
    }
});

document.getElementById('selectAll').addEventListener('change', async (e) => {
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab && tab.url && tab.url.includes('youtube.com/feed/channels')) {
            chrome.tabs.sendMessage(tab.id, {
                action: 'selectAll',
                selectAll: e.target.checked
            });
            console.log('Select all message sent:', e.target.checked);
        } else {
            console.log('Not on YouTube subscriptions page');
        }
    } catch (error) {
        console.log('Error toggling select all:', error);
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
        // Update Select All checkbox state based on count
        const selectAllCheckbox = document.getElementById('selectAll');
        if (message.count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        // Update step status when selection changes
        stepStates.step2Completed = false; // ensure step 2 not marked done just by selection
        stepStates.step3Completed = false;
        updateStepStatus();
        saveStepStates(); // Save state changes
    } else if (message.action === 'toggleSelectionMode') {
        const selectAllContainer = document.querySelector('.select-all-container');
        if (message.selectionMode) {
            selectAllContainer.style.display = 'block';
            // Update step status when selection mode is activated
            updateStepStatus();
        } else {
            selectAllContainer.style.display = 'none';
            document.getElementById('selectAll').checked = false;
        }
        saveStepStates(); // Save state changes
    } else if (message.action === 'updateProgress') {
        currentProgress = {
            isUnsubscribing: true,
            current: message.data.current,
            total: message.data.total
        };
        stepStates.isUnsubscribing = true;
        updateProgressUI(message.data);
        saveStepStates(); // Save state changes
    } else if (message.action === 'showCompletion') {
        currentProgress.isUnsubscribing = false;
        showCompletion();
        saveStepStates(); // Save state changes
    }
    return true;
});

// Listen for tab updates to refresh step status (only when popup is open)
if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
            setTimeout(updateStepStatus, 500);
        }
    });
}

// Setup accordion state synchronization across tabs
function setupAccordionSync() {
    // Listen for storage changes from other tabs/windows
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.accordionExpanded) {
            const toggle = document.getElementById('supportToggle');
            const content = document.getElementById('supportContent');
            
            if (toggle && content) {
                const newState = changes.accordionExpanded.newValue;
                
                if (newState) {
                    // Expand
                    content.classList.add('expanded');
                    toggle.classList.add('expanded');
                } else {
                    // Collapse
                    content.classList.remove('expanded');
                    toggle.classList.remove('expanded');
                }
            }
        }
    });
}

// Support accordion functionality with state persistence
async function initializeSupportAccordion() {
    const toggle = document.getElementById('supportToggle');
    const content = document.getElementById('supportContent');
    
    if (toggle && content) {
        // Load saved accordion state
        try {
            const result = await chrome.storage.local.get(['accordionExpanded']);
            const isExpanded = result.accordionExpanded || false;
            
            if (isExpanded) {
                content.classList.add('expanded');
                toggle.classList.add('expanded');
            }
        } catch (error) {
            console.log('Error loading accordion state:', error);
        }
        
        // Add click handler
        toggle.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isExpanded = content.classList.contains('expanded');
            
            if (isExpanded) {
                // Collapse
                content.classList.remove('expanded');
                toggle.classList.remove('expanded');
                // Save collapsed state
                try {
                    await chrome.storage.local.set({ accordionExpanded: false });
                } catch (error) {
                    console.log('Error saving accordion state:', error);
                }
            } else {
                // Expand
                content.classList.add('expanded');
                toggle.classList.add('expanded');
                // Save expanded state
                try {
                    await chrome.storage.local.set({ accordionExpanded: true });
                } catch (error) {
                    console.log('Error saving accordion state:', error);
                }
            }
        });
    }
}