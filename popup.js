// Enhanced popup script for task-based stopwatch extension
let currentData = null;
let updateInterval = null;

// DOM elements
const dateInput = document.getElementById("dateInput");
const prevDayBtn = document.getElementById("prevDayBtn");
const nextDayBtn = document.getElementById("nextDayBtn");
const taskNameInput = document.getElementById("taskNameInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const tasksList = document.getElementById("tasksList");
const dailySummaryList = document.getElementById("dailySummaryList");

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  loadCurrentData();
  loadDailySummary();
  startUpdateInterval();
});

// Setup event listeners
function setupEventListeners() {
  // Date change
  dateInput.addEventListener("change", () => {
    const newDate = dateInput.value;
    if (newDate) {
      changeToDate(newDate);
    }
  });
  
  // Date navigation buttons
  prevDayBtn.addEventListener("click", () => {
    navigateDate(-1);
  });
  
  nextDayBtn.addEventListener("click", () => {
    navigateDate(1);
  });
  
  // Add task
  addTaskBtn.addEventListener("click", addTask);
  taskNameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      addTask();
    }
  });
}

// Add new task
function addTask() {
  const taskName = taskNameInput.value.trim();
  if (taskName) {
    sendMessage("createTask", { taskName }, (response) => {
      if (response && response.success) {
        taskNameInput.value = "";
        loadCurrentData();
      }
    });
  }
}

// Navigate to previous or next day
function navigateDate(direction) {
  const currentDate = new Date(dateInput.value || new Date());
  currentDate.setDate(currentDate.getDate() + direction);
  
  // Format date as YYYY-MM-DD
  const newDateString = currentDate.toISOString().split('T')[0];
  
  // Update the date input and change to the new date
  dateInput.value = newDateString;
  changeToDate(newDateString);
}

// Change to a specific date
function changeToDate(dateString) {
  sendMessage("changeDate", { date: dateString }, () => {
    loadCurrentData();
    loadDailySummary();
  });
}

// Send message to background script
function sendMessage(action, data = {}, callback = null) {
  chrome.runtime.sendMessage({ action, ...data }, (response) => {
    if (callback) {
      callback(response);
    }
  });
}

// Load current app data
function loadCurrentData() {
  sendMessage("getCurrentData", {}, (data) => {
    if (data) {
      currentData = data;
      updateUI();
    }
  });
}

// Load daily summary
function loadDailySummary() {
  sendMessage("getDailySummary", { days: 7 }, (summary) => {
    if (summary) {
      updateDailySummary(summary);
    }
  });
}

// Update UI with current data
function updateUI() {
  if (!currentData) return;
  
  // Update date input
  dateInput.value = currentData.selectedDate;
  
  // Update tasks list
  updateTasksList();
  
  // Update header
  const tasksHeader = document.querySelector(".tasks-header");
  const selectedDate = new Date(currentData.selectedDate);
  const today = new Date();
  const isToday = selectedDate.toDateString() === today.toDateString();
  
  tasksHeader.textContent = isToday ? "Today's Tasks" : `Tasks for ${formatDateHeader(currentData.selectedDate)}`;
}

// Update tasks list
function updateTasksList() {
  if (!currentData || !currentData.tasks) {
    tasksList.innerHTML = "<div class=\"loading\">Loading tasks...</div>";
    return;
  }
  
  if (currentData.tasks.length === 0) {
    tasksList.innerHTML = `
      <div class=\"empty-state\">
        <div class=\"empty-state-icon\">📝</div>
        <div>No tasks for this date</div>
        <div style=\"font-size: 12px; margin-top: 5px;\">Add a task to get started!</div>
      </div>
    `;
    return;
  }
  
  // Sort tasks: running first, then by creation time
  const sortedTasks = [...currentData.tasks].sort((a, b) => {
    if (a.isRunning && !b.isRunning) return -1;
    if (!a.isRunning && b.isRunning) return 1;
    if (a.completed && !b.completed) return 1;
    if (!a.completed && b.completed) return -1;
    return b.createdAt - a.createdAt;
  });
  
  tasksList.innerHTML = sortedTasks.map(task => createTaskHTML(task)).join("");
  
  // Add event listeners to task controls
  addTaskEventListeners();
}

// Create HTML for a single task
function createTaskHTML(task) {
  const timeString = formatTime(task.currentTime || task.elapsedTime);
  const isRunning = task.isRunning;
  const isCompleted = task.completed;
  
  let statusClass = "";
  if (isRunning) statusClass = "running";
  else if (isCompleted) statusClass = "completed";
  
  return `
    <div class="task-item ${statusClass}" data-task-id="${task.id}">
      <div class="task-header">
        <div class="task-name ${isCompleted ? "completed" : ""}">${escapeHtml(task.name)}</div>
        ${isRunning ? '<span style="color: #07f511; font-size: 12px;"><b>● RUNNING</b></span>' : ""}
      </div>
      <div class="task-time">${timeString}</div>
      <div class="task-controls">
        ${!isCompleted ? `
          <button class="btn btn-small ${isRunning ? "btn-warning" : "btn-primary"}" 
                  data-action="toggle" data-task-id="${task.id}" data-running="${isRunning}">
            ${isRunning ? "⏸ Pause" : "▶ Start"}
          </button>
          <button class="btn btn-small btn-success" data-action="complete" data-task-id="${task.id}">
            ✓ Complete
          </button>
        ` : ""}
        <button class="btn btn-small btn-danger" data-action="delete" data-task-id="${task.id}">
          🗑 Delete
        </button>
      </div>
    </div>
  `;
}

// Add event listeners to task controls
function addTaskEventListeners() {
  // Remove existing event listeners
  tasksList.removeEventListener("click", handleTaskAction);
  
  // Add event delegation for task buttons
  tasksList.addEventListener("click", handleTaskAction);
}

// Handle task actions using event delegation
function handleTaskAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  const action = button.getAttribute("data-action");
  const taskId = button.getAttribute("data-task-id");
  
  switch (action) {
    case "toggle":
      const isRunning = button.getAttribute("data-running") === "true";
      toggleTask(taskId, isRunning);
      break;
    case "complete":
      completeTask(taskId);
      break;
    case "delete":
      deleteTask(taskId);
      break;
  }
}

// Toggle task (start/pause)
function toggleTask(taskId, isCurrentlyRunning) {
  const action = isCurrentlyRunning ? "pauseTask" : "startTask";
  sendMessage(action, { taskId }, (response) => {
    if (response && response.success) {
      loadCurrentData();
    }
  });
}

// Complete task
function completeTask(taskId) {
  sendMessage("completeTask", { taskId }, (response) => {
    if (response && response.success) {
      loadCurrentData();
      loadDailySummary(); // Refresh summary when task is completed
    }
  });
}

// Delete task
function deleteTask(taskId) {
  if (confirm("Are you sure you want to delete this task?")) {
    sendMessage("deleteTask", { taskId }, (response) => {
      if (response && response.success) {
        loadCurrentData();
        loadDailySummary(); // Refresh summary when task is deleted
      }
    });
  }
}

// Update daily summary
function updateDailySummary(summary) {
  if (!summary) {
    dailySummaryList.innerHTML = "<div class=\"loading\">Loading summary...</div>";
    return;
  }
  
  const sortedDates = Object.keys(summary).sort((a, b) => new Date(b) - new Date(a));
  
  if (sortedDates.length === 0) {
    dailySummaryList.innerHTML = "<div style=\"text-align: center; color: rgba(255,255,255,0.7);\">No data available</div>";
    return;
  }
  
  dailySummaryList.innerHTML = sortedDates.map(date => {
    const data = summary[date];
    const timeString = formatTime(data.totalTime);
    const dateLabel = formatDateForSummary(date);
    
    return `
      <div class=\"summary-item\">
        <span class=\"summary-date\">${dateLabel}</span>
        <span class=\"summary-time\">${timeString} (${data.completedTasks}/${data.taskCount})</span>
      </div>
    `;
  }).join("");
}

// Format time in HH:MM:SS
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

// Format date for header
function formatDateHeader(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { 
    weekday: "short", 
    month: "short", 
    day: "numeric" 
  });
}

// Format date for summary
function formatDateForSummary(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (dateString === today.toISOString().split("T")[0]) {
    return "Today";
  } else if (dateString === yesterday.toISOString().split("T")[0]) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Start update interval for running tasks
function startUpdateInterval() {
  updateInterval = setInterval(() => {
    if (currentData && currentData.tasks && currentData.tasks.some(task => task.isRunning)) {
      loadCurrentData();
    }
  }, 1000);
}

// Clean up when popup closes
window.addEventListener("beforeunload", () => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
});


