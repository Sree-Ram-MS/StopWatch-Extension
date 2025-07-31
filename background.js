// Enhanced background script for task-based stopwatch extension
let appState = {
  selectedDate: null,
  tasks: {},
  activeTaskId: null
};

// Initialize the extension
chrome.runtime.onInstalled.addListener(() => {
  initializeApp();
});

// Initialize app state
async function initializeApp() {
  const today = new Date().toISOString().split('T')[0];
  appState.selectedDate = today;
  
  // Load existing data
  const result = await chrome.storage.local.get(['taskData', 'appState']);
  if (result.appState) {
    appState = { ...appState, ...result.appState };
  }
  
  // Ensure selected date is set
  if (!appState.selectedDate) {
    appState.selectedDate = today;
  }
  
  await saveAppState();
}

// Generate unique task ID
function generateTaskId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Create a new task
async function createTask(taskName) {
  const taskId = generateTaskId();
  const selectedDate = appState.selectedDate;
  
  // Get existing task data
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  // Initialize date if it doesn't exist
  if (!taskData[selectedDate]) {
    taskData[selectedDate] = [];
  }
  
  // Create new task
  const newTask = {
    id: taskId,
    name: taskName,
    elapsedTime: 0,
    isRunning: false,
    startTime: null,
    completed: false,
    createdAt: Date.now()
  };
  
  taskData[selectedDate].push(newTask);
  
  // Save to storage
  await chrome.storage.local.set({ taskData });
  
  return newTask;
}

// Get tasks for a specific date
async function getTasksForDate(date) {
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  return taskData[date] || [];
}

// Update task in storage
async function updateTask(taskId, updates) {
  const selectedDate = appState.selectedDate;
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  if (taskData[selectedDate]) {
    const taskIndex = taskData[selectedDate].findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      taskData[selectedDate][taskIndex] = { ...taskData[selectedDate][taskIndex], ...updates };
      await chrome.storage.local.set({ taskData });
      return taskData[selectedDate][taskIndex];
    }
  }
  return null;
}

// Start task timer
async function startTaskTimer(taskId) {
  // Stop any currently running task
  await stopAllRunningTasks();
  
  const task = await updateTask(taskId, {
    isRunning: true,
    startTime: Date.now()
  });
  
  if (task) {
    appState.activeTaskId = taskId;
    await saveAppState();
    startTimerInterval();
  }
  
  return task;
}

// Pause task timer
async function pauseTaskTimer(taskId) {
  const selectedDate = appState.selectedDate;
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  if (taskData[selectedDate]) {
    const taskIndex = taskData[selectedDate].findIndex(task => task.id === taskId);
    if (taskIndex !== -1) {
      const task = taskData[selectedDate][taskIndex];
      if (task.isRunning && task.startTime) {
        const additionalTime = Date.now() - task.startTime;
        task.elapsedTime += additionalTime;
        task.isRunning = false;
        task.startTime = null;
        
        await chrome.storage.local.set({ taskData });
        
        if (appState.activeTaskId === taskId) {
          appState.activeTaskId = null;
          await saveAppState();
        }
        
        return task;
      }
    }
  }
  return null;
}

// Complete task
async function completeTask(taskId) {
  // First pause the timer if running
  await pauseTaskTimer(taskId);
  
  // Mark as completed
  const task = await updateTask(taskId, {
    completed: true,
    completedAt: Date.now()
  });
  
  return task;
}

// Delete task
async function deleteTask(taskId) {
  const selectedDate = appState.selectedDate;
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  if (taskData[selectedDate]) {
    taskData[selectedDate] = taskData[selectedDate].filter(task => task.id !== taskId);
    await chrome.storage.local.set({ taskData });
    
    if (appState.activeTaskId === taskId) {
      appState.activeTaskId = null;
      await saveAppState();
    }
    
    return true;
  }
  return false;
}

// Stop all running tasks
async function stopAllRunningTasks() {
  const selectedDate = appState.selectedDate;
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  if (taskData[selectedDate]) {
    let hasChanges = false;
    taskData[selectedDate].forEach(task => {
      if (task.isRunning && task.startTime) {
        const additionalTime = Date.now() - task.startTime;
        task.elapsedTime += additionalTime;
        task.isRunning = false;
        task.startTime = null;
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      await chrome.storage.local.set({ taskData });
    }
  }
  
  appState.activeTaskId = null;
  await saveAppState();
}

// Change selected date
async function changeSelectedDate(newDate) {
  // Stop any running tasks before changing date
  await stopAllRunningTasks();
  
  appState.selectedDate = newDate;
  appState.activeTaskId = null;
  await saveAppState();
  
  return appState;
}

// Save app state
async function saveAppState() {
  await chrome.storage.local.set({ appState });
}

// Timer interval for active task
function startTimerInterval() {
  if (appState.activeTaskId) {
    setTimeout(async () => {
      if (appState.activeTaskId) {
        // Check if task is still running
        const tasks = await getTasksForDate(appState.selectedDate);
        const activeTask = tasks.find(task => task.id === appState.activeTaskId);
        
        if (activeTask && activeTask.isRunning) {
          startTimerInterval();
        } else {
          appState.activeTaskId = null;
          await saveAppState();
        }
      }
    }, 1000);
  }
}

// Get current app data
async function getCurrentAppData() {
  const tasks = await getTasksForDate(appState.selectedDate);
  
  // Calculate current time for running tasks
  const tasksWithCurrentTime = tasks.map(task => {
    if (task.isRunning && task.startTime) {
      return {
        ...task,
        currentTime: task.elapsedTime + (Date.now() - task.startTime)
      };
    }
    return {
      ...task,
      currentTime: task.elapsedTime
    };
  });
  
  return {
    selectedDate: appState.selectedDate,
    tasks: tasksWithCurrentTime,
    activeTaskId: appState.activeTaskId
  };
}

// Get daily summary for multiple dates
async function getDailySummary(days = 7) {
  const result = await chrome.storage.local.get(['taskData']);
  const taskData = result.taskData || {};
  
  const summary = {};
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateString = date.toISOString().split('T')[0];
    
    const dayTasks = taskData[dateString] || [];
    const totalTime = dayTasks.reduce((sum, task) => sum + task.elapsedTime, 0);
    const completedTasks = dayTasks.filter(task => task.completed).length;
    
    summary[dateString] = {
      totalTime,
      taskCount: dayTasks.length,
      completedTasks
    };
  }
  
  return summary;
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'createTask':
      createTask(request.taskName).then(task => sendResponse({ success: true, task }));
      return true;
      
    case 'startTask':
      startTaskTimer(request.taskId).then(task => sendResponse({ success: true, task }));
      return true;
      
    case 'pauseTask':
      pauseTaskTimer(request.taskId).then(task => sendResponse({ success: true, task }));
      return true;
      
    case 'completeTask':
      completeTask(request.taskId).then(task => sendResponse({ success: true, task }));
      return true;
      
    case 'deleteTask':
      deleteTask(request.taskId).then(result => sendResponse({ success: result }));
      return true;
      
    case 'changeDate':
      changeSelectedDate(request.date).then(state => sendResponse({ success: true, state }));
      return true;
      
    case 'getCurrentData':
      getCurrentAppData().then(data => sendResponse(data));
      return true;
      
    case 'getDailySummary':
      getDailySummary(request.days || 7).then(summary => sendResponse(summary));
      return true;
  }
});

// Initialize when the service worker starts
initializeApp();

