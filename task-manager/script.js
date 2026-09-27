const STORAGE_KEY = "mattOOP.tasks";

const taskForm = document.getElementById("taskForm");
const taskTitleInput = document.getElementById("taskTitle");
const taskCategoryInput = document.getElementById("taskCategory");
const taskPriorityInput = document.getElementById("taskPriority");
const taskDueDateInput = document.getElementById("taskDueDate");
const taskDescriptionInput = document.getElementById("taskDescription");
const formMessage = document.getElementById("formMessage");
const taskList = document.getElementById("taskList");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const formTitle = document.getElementById("formTitle");
const submitButton = document.getElementById("submitButton");
const cancelEditButton = document.getElementById("cancelEdit");

const state = {
  tasks: loadTasks(),
  editingId: null,
};

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return [
      {
        id: "sample-1",
        title: "Prepare presentation outline",
        category: "Study",
        priority: "High",
        dueDate: getTodayDate(),
        description: "Draft slides and final structure for tomorrow's class talk.",
        completed: false,
      },
      {
        id: "sample-2",
        title: "Buy groceries",
        category: "Errands",
        priority: "Medium",
        dueDate: addDaysToDate(1),
        description: "Eggs, rice, fruit, and bottled water for the week.",
        completed: true,
      },
      {
        id: "sample-3",
        title: "Create project proposal",
        category: "Work",
        priority: "High",
        dueDate: addDaysToDate(2),
        description: "Finalize the ideas and plan for the group assignment.",
        completed: false,
      },
    ];
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function getTodayDate() {
  const date = new Date();
  return date.toISOString().split("T")[0];
}

function addDaysToDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function showMessage(message, isError = false) {
  formMessage.textContent = message;
  formMessage.style.color = isError ? "#ef4444" : "#16a34a";
}

function renderStats() {
  const totalTasks = state.tasks.length;
  const completedTasks = state.tasks.filter((task) => task.completed).length;
  const pendingTasks = totalTasks - completedTasks;
  const highPriorityTasks = state.tasks.filter(
    (task) => task.priority === "High" && !task.completed
  ).length;

  document.getElementById("totalTasks").textContent = String(totalTasks);
  document.getElementById("completedTasks").textContent = String(completedTasks);
  document.getElementById("pendingTasks").textContent = String(pendingTasks);
  document.getElementById("highPriorityTasks").textContent = String(highPriorityTasks);
}

function getFilteredTasks() {
  const searchTerm = searchInput.value.trim().toLowerCase();
  const filterStatus = statusFilter.value;

  return state.tasks.filter((task) => {
    const matchesSearch =
      !searchTerm ||
      task.title.toLowerCase().includes(searchTerm) ||
      task.description.toLowerCase().includes(searchTerm) ||
      task.category.toLowerCase().includes(searchTerm);

    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "completed" && task.completed) ||
      (filterStatus === "active" && !task.completed);

    return matchesSearch && matchesStatus;
  });
}

function formatDate(dateValue) {
  if (!dateValue) return "No due date";
  const date = new Date(dateValue + "T00:00:00");
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function renderTasks() {
  const filteredTasks = getFilteredTasks();

  if (!filteredTasks.length) {
    taskList.innerHTML = '<div class="empty-state">No tasks match your current filters.</div>';
    renderStats();
    return;
  }

  taskList.innerHTML = filteredTasks
    .map(
      (task) => `
        <article class="task-item ${task.completed ? "completed" : ""}">
          <div class="task-top">
            <div class="task-title-group">
              <span class="task-badge ${task.category.toLowerCase()}">${task.category}</span>
              <h3>${task.title}</h3>
            </div>
            <span class="priority-pill ${task.priority.toLowerCase()}">${task.priority}</span>
          </div>

          <p>${task.description || "No description provided."}</p>

          <div class="task-meta">
            <span>Due: ${formatDate(task.dueDate)}</span>
            <span>${task.completed ? "Completed" : "Active"}</span>
          </div>

          <div class="task-actions">
            <button class="action-btn complete" data-action="toggle" data-id="${task.id}">
              ${task.completed ? "Mark Active" : "Mark Done"}
            </button>
            <button class="action-btn edit" data-action="edit" data-id="${task.id}">Edit</button>
            <button class="action-btn delete" data-action="delete" data-id="${task.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");

  renderStats();
}

function resetForm() {
  taskForm.reset();
  taskCategoryInput.value = "Study";
  taskPriorityInput.value = "Medium";
  formTitle.textContent = "Add New Task";
  submitButton.textContent = "Add Task";
  cancelEditButton.classList.add("hidden");
  state.editingId = null;
  showMessage("");
}

function validateTaskForm() {
  const title = taskTitleInput.value.trim();
  const description = taskDescriptionInput.value.trim();

  if (!title) {
    showMessage("Task title is required.", true);
    taskTitleInput.focus();
    return false;
  }

  if (description.length < 5) {
    showMessage("Please add a clearer description with at least 5 characters.", true);
    taskDescriptionInput.focus();
    return false;
  }

  return true;
}

function handleSubmit(event) {
  event.preventDefault();

  if (!validateTaskForm()) {
    return;
  }

  const taskData = {
    id: state.editingId || `task-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`,
    title: taskTitleInput.value.trim(),
    category: taskCategoryInput.value,
    priority: taskPriorityInput.value,
    dueDate: taskDueDateInput.value,
    description: taskDescriptionInput.value.trim(),
    completed: state.editingId
      ? state.tasks.find((task) => task.id === state.editingId)?.completed || false
      : false,
  };

  if (state.editingId) {
    state.tasks = state.tasks.map((task) => (task.id === state.editingId ? taskData : task));
    showMessage("Task updated successfully.");
  } else {
    state.tasks.unshift(taskData);
    showMessage("Task added successfully.");
  }

  saveTasks();
  renderTasks();
  resetForm();
}

function handleTaskAction(event) {
  const target = event.target.closest("button");
  if (!target) return;

  const { action, id } = target.dataset;
  const selectedTask = state.tasks.find((task) => task.id === id);
  if (!selectedTask) return;

  if (action === "toggle") {
    selectedTask.completed = !selectedTask.completed;
    saveTasks();
    renderTasks();
    return;
  }

  if (action === "delete") {
    state.tasks = state.tasks.filter((task) => task.id !== id);
    saveTasks();
    renderTasks();

    if (state.editingId === id) {
      resetForm();
    }
    return;
  }

  if (action === "edit") {
    state.editingId = id;
    formTitle.textContent = "Edit Task";
    submitButton.textContent = "Save Changes";
    cancelEditButton.classList.remove("hidden");

    taskTitleInput.value = selectedTask.title;
    taskCategoryInput.value = selectedTask.category;
    taskPriorityInput.value = selectedTask.priority;
    taskDueDateInput.value = selectedTask.dueDate || "";
    taskDescriptionInput.value = selectedTask.description;

    window.scrollTo({ top: 0, behavior: "smooth" });
    taskTitleInput.focus();
  }
}

function attachListeners() {
  taskForm.addEventListener("submit", handleSubmit);
  taskList.addEventListener("click", handleTaskAction);
  searchInput.addEventListener("input", renderTasks);
  statusFilter.addEventListener("change", renderTasks);
  cancelEditButton.addEventListener("click", resetForm);
}

attachListeners();
renderTasks();
