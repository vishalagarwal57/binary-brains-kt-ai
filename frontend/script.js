// =====================
// Config
// =====================

const API_URL = "http://127.0.0.1:8000";
// const API_URL = "https://binary-brains-kt-ai-5.onrender.com";

let dotInterval;
let quizQuestions = [];
let currentQuestion = 0;
let score = 0;


// =====================
// Tab Navigation
// =====================

function switchTab(tab) {

    // Deactivate all tabs and panels
    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(panel => panel.classList.remove("active"));

    // Activate selected
    document.getElementById(`tab-${tab}`).classList.add("active");
    document.getElementById(`panel-${tab}`).classList.add("active");

    // Load data for specific tabs
    if (tab === "assignments") loadAssignments();
    if (tab === "documents") checkSharePointStatus();
}


// =====================
// Notification
// =====================

function showNotification(message, type = "success") {

    const notification = document.getElementById("notification");
    notification.textContent = message;
    notification.className = `notification ${type} visible`;

    setTimeout(() => {
        notification.classList.remove("visible");
    }, 4000);
}


// =====================
// File Select Handler
// =====================

function handleFileSelect(input) {

    const file = input.files[0];

    if (!file) return;

    const prompt = document.getElementById("uploadPrompt");
    const selected = document.getElementById("selectedFile");

    prompt.style.display = "none";
    selected.style.display = "flex";
    selected.innerHTML = `
        <span class="file-icon">📄</span>
        <div>
            <strong>${file.name}</strong>
            <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
        </div>
        <button class="btn-clear" onclick="clearFile()">✕</button>
    `;
}

function clearFile() {

    document.getElementById("fileInput").value = "";
    document.getElementById("uploadPrompt").style.display = "flex";
    document.getElementById("selectedFile").style.display = "none";
}


// =====================
// Upload Document
// =====================

async function uploadFile() {

    const file = document.getElementById("fileInput").files[0];

    if (!file) {
        showNotification("Please select a file first.", "error");
        return;
    }

    const btn = document.getElementById("uploadBtn");
    btn.textContent = "Uploading...";
    btn.disabled = true;

    try {

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_URL}/upload`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        showNotification(`✅ "${data.file_name}" uploaded & indexed!`);

        // Show doc badge in header
        document.getElementById("docBadge").style.display = "flex";
        document.getElementById("docBadgeText").textContent = data.file_name;

        // Show index building status on Ask tab
        document.getElementById("indexStatus").style.display = "flex";

        btn.textContent = "✅ Uploaded";
        btn.classList.add("uploaded");

        // Poll until semantic index is ready
        pollIndexStatus();

    } catch (error) {

        showNotification(`❌ Upload failed: ${error}`, "error");
        btn.textContent = "Upload & Index Document";
        btn.disabled = false;
    }
}


// =====================
// Poll Semantic Index
// =====================

async function pollIndexStatus() {

    const maxAttempts = 20;
    let attempts = 0;

    const interval = setInterval(async () => {

        attempts++;

        try {

            const response = await fetch(`${API_URL}/`);
            const data = await response.json();

            if (data.semantic_search_ready) {

                clearInterval(interval);

                const statusEl = document.getElementById("indexStatus");
                if (statusEl) {
                    statusEl.className = "index-status ready";
                    statusEl.innerHTML = `
                        <span class="status-dot"></span>
                        <span>✅ Semantic index ready — ${data.chunks_indexed} chunks indexed</span>
                    `;
                }

                showNotification("🧠 Semantic search index ready!");
            }

        } catch (e) {
            // Ignore poll errors
        }

        if (attempts >= maxAttempts) {
            clearInterval(interval);
        }

    }, 3000);
}


// =====================
// Generate Summary
// =====================

async function generateSummary() {

    showGenLoader("Generating Knowledge Summary");

    document.getElementById("quizContainer").style.display = "none";
    document.getElementById("genOutput").style.display = "none";

    try {

        const response = await fetch(`${API_URL}/summary`);
        const data = await response.json();

        showGenOutput(
            data.response || `<div class="error-card"><h2>No Response</h2></div>`,
            data.model_used
        );

    } catch (error) {

        showGenOutput(`<div class="error-card"><h2>❌ Error</h2><p>${error}</p></div>`);

    } finally {

        hideGenLoader();
    }
}


// =====================
// Generate Assessment
// =====================

async function generateAssessment() {

    resetQuiz();

    document.getElementById("genOutput").style.display = "none";
    document.getElementById("quizContainer").style.display = "none";

    showGenLoader("Generating Assessment Quiz");

    try {

        const response = await fetch(`${API_URL}/assessment`);
        const data = await response.json();

        parseAssessment(data.response);

    } catch (error) {

        showGenOutput(`<div class="error-card"><h2>❌ Error</h2><p>${error}</p></div>`);

    } finally {

        hideGenLoader();
    }
}


// =====================
// Gen Loader Helpers
// =====================

function showGenLoader(message) {

    const loader = document.getElementById("genLoader");
    document.getElementById("genLoaderText").textContent = message + "...";
    loader.style.display = "flex";
}

function hideGenLoader() {

    document.getElementById("genLoader").style.display = "none";
}

function showGenOutput(html, model) {

    const out = document.getElementById("genOutput");
    out.style.display = "block";
    out.innerHTML = `
        <div class="output-meta">
            ${model ? `<span class="model-tag">🤖 ${model}</span>` : ""}
        </div>
        <div class="result-card">${html}</div>
    `;
}


// =====================
// Ask Question (Semantic Search + Citations)
// =====================

async function askQuestion() {

    const question = document.getElementById("question").value.trim();

    if (!question) {
        showNotification("Please enter a question.", "error");
        return;
    }

    const loader = document.getElementById("askLoader");
    const answerCard = document.getElementById("answerCard");

    loader.style.display = "flex";
    answerCard.style.display = "none";
    document.getElementById("askLoaderText").textContent = "Searching knowledge base...";

    try {

        const response = await fetch(
            `${API_URL}/ask?question=${encodeURIComponent(question)}`
        );
        const data = await response.json();

        // Show answer
        document.getElementById("answerContent").innerHTML =
            data.response || `<div class="error-card"><h2>No Response</h2></div>`;

        // Show citations if available
        const citationsBox = document.getElementById("citationsBox");
        const citationsList = document.getElementById("citationsList");

        if (data.citations && data.citations.length > 0) {

            citationsBox.style.display = "block";
            citationsList.innerHTML = data.citations.map(c => `
                <div class="citation-item">
                    <span class="citation-num">Source ${c.index}</span>
                    <span class="citation-score">Relevance: ${(c.similarity * 100).toFixed(0)}%</span>
                    <p class="citation-preview">"${c.preview}"</p>
                </div>
            `).join("");

        } else {

            citationsBox.style.display = "none";
        }

        if (data.model_used) {
            document.getElementById("answerContent").insertAdjacentHTML(
                "beforebegin",
                `<div class="output-meta"><span class="model-tag">🤖 ${data.model_used}</span></div>`
            );
        }

        answerCard.style.display = "block";
        document.getElementById("question").value = "";

    } catch (error) {

        document.getElementById("answerContent").innerHTML =
            `<div class="error-card"><h2>❌ Error</h2><p>${error}</p></div>`;
        answerCard.style.display = "block";

    } finally {

        loader.style.display = "none";
    }
}


// =====================
// Quiz Functions
// =====================

function resetQuiz() {

    quizQuestions = [];
    currentQuestion = 0;
    score = 0;

    document.getElementById("questionBox").innerHTML = "";
    document.getElementById("optionsBox").innerHTML = "";
    document.getElementById("feedbackBox").innerHTML = "";
    document.getElementById("submitAnswerBtn").style.display = "inline-block";
    document.getElementById("nextQuestionBtn").style.display = "none";
}


function parseAssessment(text) {

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = text;
    text = tempDiv.innerText;

    quizQuestions = [];
    currentQuestion = 0;
    score = 0;

    const questionBlocks = text.split(/Question\s+\d+:/i);

    questionBlocks.forEach(block => {

        if (!block.trim()) return;

        const answerMatch = block.match(/Answer:\s*(.+)/i);
        if (!answerMatch) return;

        const answer = answerMatch[1].trim();

        let lines = block
            .replace(/Answer:.*/i, "")
            .split("\n")
            .map(line => line.trim())
            .filter(line => line !== "");

        const question = lines.shift();
        const options = lines.slice(0, 4);

        if (question && options.length === 4) {
            quizQuestions.push({ question, options, answer });
        }
    });

    if (quizQuestions.length === 0) {
        showGenOutput(`<div class="error-card"><h2>⚠️ Parse Error</h2><p>Could not parse questions. Try generating again.</p></div>`);
        return;
    }

    document.getElementById("quizContainer").style.display = "block";
    loadQuestion();
}


function loadQuestion() {

    const q = quizQuestions[currentQuestion];

    document.getElementById("questionBox").innerHTML = `
        <div class="quiz-progress">
            Question ${currentQuestion + 1} of ${quizQuestions.length}
            <div class="progress-bar"><div class="progress-fill" style="width:${((currentQuestion + 1) / quizQuestions.length) * 100}%"></div></div>
        </div>
        <p class="quiz-question">${q.question}</p>
    `;

    let html = "";
    q.options.forEach(option => {
        html += `
            <label class="option-label">
                <input type="radio" name="quizOption" value="${option}">
                <span class="option-text">${option}</span>
            </label>
        `;
    });

    document.getElementById("optionsBox").innerHTML = html;
    document.getElementById("feedbackBox").innerHTML = "";
    document.getElementById("submitAnswerBtn").style.display = "inline-block";
    document.getElementById("nextQuestionBtn").style.display = "none";
}


function submitAnswer() {

    const selected = document.querySelector('input[name="quizOption"]:checked');

    if (!selected) {
        showNotification("Please select an answer.", "error");
        return;
    }

    const userAnswer = selected.value.trim();
    const correctAnswer = quizQuestions[currentQuestion].answer;

    if (userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()) {

        score++;
        document.getElementById("feedbackBox").innerHTML = `
            <div class="correct-answer">✅ Correct!</div>
        `;

    } else {

        document.getElementById("feedbackBox").innerHTML = `
            <div class="wrong-answer">
                ❌ Incorrect
                <br>
                <strong>Correct Answer:</strong> ${correctAnswer}
            </div>
        `;
    }

    document.getElementById("submitAnswerBtn").style.display = "none";
    document.getElementById("nextQuestionBtn").style.display = "inline-block";
}


function nextQuestion() {

    currentQuestion++;

    if (currentQuestion >= quizQuestions.length) {

        const percentage = Math.round((score / quizQuestions.length) * 100);
        const grade = percentage >= 80 ? "🏆 Excellent!" : percentage >= 60 ? "👍 Good" : "📚 Keep Studying";

        document.getElementById("questionBox").innerHTML = `
            <div class="score-card">
                <h2>🎉 Assessment Complete</h2>
                <div class="score">${score}/${quizQuestions.length}</div>
                <div class="percentage">${percentage}%</div>
                <div class="grade">${grade}</div>
            </div>
        `;

        document.getElementById("optionsBox").innerHTML = "";
        document.getElementById("feedbackBox").innerHTML = "";
        document.getElementById("submitAnswerBtn").style.display = "none";
        document.getElementById("nextQuestionBtn").style.display = "none";

        return;
    }

    loadQuestion();
}


// =====================
// Assignment Tracker
// =====================

async function createNewAssignment() {

    const doc = document.getElementById("assignDoc").value.trim();
    const assignee = document.getElementById("assignee").value.trim();
    const assignBy = document.getElementById("assignBy").value.trim() || "Manager";
    const dueDate = document.getElementById("dueDate").value;

    if (!doc || !assignee || !dueDate) {
        showNotification("Please fill in all fields.", "error");
        return;
    }

    try {

        const response = await fetch(`${API_URL}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                document: doc,
                assignee: assignee,
                assigned_by: assignBy,
                due_date: dueDate
            })
        });

        const data = await response.json();

        if (data.status === "success") {

            showNotification(`✅ Assigned "${doc}" to ${assignee}`);

            // Clear form
            document.getElementById("assignDoc").value = "";
            document.getElementById("assignee").value = "";
            document.getElementById("dueDate").value = "";

            loadAssignments();

        } else {

            showNotification("❌ Failed to create assignment.", "error");
        }

    } catch (error) {

        showNotification(`❌ Error: ${error}`, "error");
    }
}


async function loadAssignments() {

    try {

        const response = await fetch(`${API_URL}/assignments`);
        const data = await response.json();

        if (data.status === "success") {
            renderAssignments(data.assignments);
            updateStats(data.stats);
        }

    } catch (error) {

        console.error("Failed to load assignments:", error);
    }
}


function updateStats(stats) {

    document.getElementById("statTotal").textContent = stats.total;
    document.getElementById("statPending").textContent = stats.pending;
    document.getElementById("statCompleted").textContent = stats.completed;
    document.getElementById("statRate").textContent = `${stats.completion_rate}%`;

    // Update sidebar pending badge
    const badge = document.getElementById("pendingBadge");
    if (stats.pending > 0) {
        badge.textContent = stats.pending;
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
    }
}


function renderAssignments(assignments) {

    const container = document.getElementById("assignmentsTable");

    if (!assignments || assignments.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span>📭</span>
                <p>No assignments yet. Create one above!</p>
            </div>
        `;
        return;
    }

    const rows = assignments.map(a => {

        const isPending = a.status === "pending";
        const dueDate = new Date(a.due_date).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric"
        });

        const isOverdue = isPending && new Date(a.due_date) < new Date();

        return `
            <div class="assignment-row ${a.status}">
                <div class="assignment-info">
                    <div class="assignment-doc">📄 ${a.document}</div>
                    <div class="assignment-meta">
                        👤 ${a.assignee} &nbsp;·&nbsp;
                        📅 Due: <span class="${isOverdue ? 'overdue' : ''}">${dueDate}</span>
                        &nbsp;·&nbsp; Assigned by: ${a.assigned_by}
                    </div>
                </div>
                <div class="assignment-actions">
                    <span class="status-badge ${a.status}">
                        ${a.status === "completed" ? "✅ Completed" : isOverdue ? "⚠️ Overdue" : "🕐 Pending"}
                    </span>
                    ${isPending ? `
                        <button class="btn btn-sm btn-success" onclick="completeAssignment('${a.id}')">Mark Done</button>
                    ` : ""}
                    <button class="btn btn-sm btn-danger" onclick="removeAssignment('${a.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join("");

    container.innerHTML = rows;
}


async function completeAssignment(id) {

    try {

        const response = await fetch(`${API_URL}/assignments/${id}/complete`, {
            method: "PUT"
        });

        const data = await response.json();

        if (data.status === "success") {
            showNotification("✅ Assignment marked as complete!");
            loadAssignments();
        }

    } catch (error) {

        showNotification(`❌ Error: ${error}`, "error");
    }
}


async function removeAssignment(id) {

    if (!confirm("Delete this assignment?")) return;

    try {

        const response = await fetch(`${API_URL}/assignments/${id}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (data.status === "success") {
            showNotification("🗑️ Assignment deleted.");
            loadAssignments();
        }

    } catch (error) {

        showNotification(`❌ Error: ${error}`, "error");
    }
}


// =====================
// SharePoint
// =====================

async function checkSharePointStatus() {

    const badge = document.getElementById("spStatus");
    const notConfiguredBox = document.getElementById("spNotConfigured");
    const docList = document.getElementById("spDocList");

    try {

        const response = await fetch(`${API_URL}/sharepoint/status`);
        const data = await response.json();

        if (data.configured) {

            badge.textContent = "Connected ✅";
            badge.className = "sp-status-badge connected";
            notConfiguredBox.style.display = "none";
            loadSharePointDocuments();

        } else {

            badge.textContent = "Not configured";
            badge.className = "sp-status-badge disconnected";
            notConfiguredBox.style.display = "block";
            docList.style.display = "none";
        }

    } catch (error) {

        badge.textContent = "Offline";
        badge.className = "sp-status-badge disconnected";
    }
}


async function loadSharePointDocuments() {

    const docList = document.getElementById("spDocList");

    docList.style.display = "block";
    docList.innerHTML = `<div class="loading-docs"><div class="spinner-sm"></div> Loading documents...</div>`;

    try {

        const response = await fetch(`${API_URL}/sharepoint/documents`);
        const data = await response.json();

        if (data.status !== "success" || data.documents.length === 0) {

            docList.innerHTML = `
                <div class="empty-state">
                    <span>📂</span>
                    <p>${data.message || "No documents found in SharePoint."}</p>
                </div>
            `;
            return;
        }

        docList.innerHTML = data.documents.map(doc => {

            const modified = new Date(doc.last_modified).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric"
            });
            const sizeMB = (doc.size / 1024).toFixed(1);

            return `
                <div class="sp-doc-item">
                    <div class="sp-doc-info">
                        <span class="sp-doc-name">📄 ${doc.name}</span>
                        <span class="sp-doc-meta">Modified: ${modified} · ${sizeMB} KB</span>
                    </div>
                    <div class="sp-doc-actions">
                        <a href="${doc.web_url}" target="_blank" class="btn btn-ghost btn-sm">View ↗</a>
                        <button class="btn btn-primary btn-sm" onclick="loadFromSharePoint('${doc.id}', '${doc.name}')">Load</button>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {

        docList.innerHTML = `<div class="error-card"><p>Failed to load: ${error}</p></div>`;
    }
}


async function loadFromSharePoint(docId, docName) {

    showNotification(`⏳ Loading "${docName}" from SharePoint...`);

    try {

        const response = await fetch(`${API_URL}/sharepoint/fetch?doc_id=${docId}`, {
            method: "POST"
        });

        const data = await response.json();

        if (data.status === "success") {

            showNotification(`✅ "${docName}" loaded and indexing!`);
            document.getElementById("docBadge").style.display = "flex";
            document.getElementById("docBadgeText").textContent = docName;
            document.getElementById("indexStatus").style.display = "flex";
            pollIndexStatus();

        } else {

            showNotification(`❌ ${data.message}`, "error");
        }

    } catch (error) {

        showNotification(`❌ Error: ${error}`, "error");
    }
}


// =====================
// Init on Load
// =====================

window.addEventListener("load", () => {

    checkSharePointStatus();

    // Set default due date to 7 days from now
    const dueInput = document.getElementById("dueDate");
    if (dueInput) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        dueInput.value = d.toISOString().split("T")[0];
    }
});