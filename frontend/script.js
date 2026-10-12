// const API_URL = "http://127.0.0.1:8000";
const API_URL = "https://binary-brains-kt-ai-5.onrender.com";

let dotInterval;
let quizQuestions = [];
let currentQuestion = 0;
let score = 0;

// =====================
// Notification
// =====================

function showNotification(message) {

    const notification =
        document.getElementById("notification");

    notification.textContent = message;

    notification.style.display = "block";

    setTimeout(() => {

        notification.style.display = "none";

    }, 5000);
}


// =====================
// Loader Functions
// =====================

function showLoader(message) {

    document.getElementById(
        "thinking"
    ).style.display = "block";

    document.getElementById(
        "spinner"
    ).style.display = "block";

    document.getElementById(
        "thinking"
    ).innerHTML =
        `🤖 ${message} <span id="dots"></span>`;

    const dots =
        document.getElementById("dots");

    let count = 0;

    dotInterval = setInterval(() => {

        count++;

        dots.textContent =
            ".".repeat(count % 4);

    }, 500);
}

function hideLoader() {

    document.getElementById(
        "thinking"
    ).style.display = "none";

    document.getElementById(
        "spinner"
    ).style.display = "none";

    clearInterval(dotInterval);
}


// =====================
// HTML Formatter
// =====================

function formatAIResponse(text) {

    if (!text) {

        return `
            <div class="error-card">

                <h2>No Response Available</h2>

                <p>
                    The AI model did not return any response.
                </p>

            </div>
        `;
    }

    return text;
}


// =====================
// Upload Document
// =====================

async function uploadFile() {

    const file =
        document.getElementById(
            "fileInput"
        ).files[0];

    if (!file) {

        alert(
            "Please select a file."
        );

        return;
    }

    showLoader(
        "Uploading document"
    );

    try {

        const formData =
            new FormData();

        formData.append(
            "file",
            file
        );

        const response =
            await fetch(
                `${API_URL}/upload`,
                {
                    method: "POST",
                    body: formData
                }
            );

        const data =
            await response.json();

        showNotification(
            "✅ Document Uploaded Successfully"
        );

        const uploadBtn =
            document.getElementById(
                "uploadBtn"
            );

        uploadBtn.innerHTML =
            "✅ Uploaded";

        uploadBtn.classList.add(
            "uploaded"
        );

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="success-card">

                <h2>
                    ✅ Document Uploaded Successfully
                </h2>

                <p>
                    <strong>File Name:</strong>
                    ${data.file_name}
                </p>

                <p>
                    <strong>Extracted Characters:</strong>
                    ${data.text_length}
                </p>

                <p>
                    <strong>Status:</strong>
                    ${data.message}
                </p>

                <br>

                <p>
                    You can now:
                </p>

                <ul>
                    <li>Generate Knowledge Summary</li>
                    <li>Create Support Runbook</li>
                    <li>Ask Questions from KT</li>
                    <li>Generate Assessment</li>
                </ul>

            </div>
        `;

    } catch (error) {

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="error-card">

                <h2>
                    ❌ Upload Failed
                </h2>

                <p>
                    ${error}
                </p>

            </div>
        `;

    } finally {

        hideLoader();
    }
}


// =====================
// Generate Summary
// =====================

async function generateSummary() {

    document.getElementById(
        "quizContainer"
    ).style.display = "none";

    document.getElementById(
        "result"
    ).style.display = "block";

    showLoader(
        "Generating Knowledge Summary"
    );

    try {

        const response =
            await fetch(
                `${API_URL}/summary`
            );

        const data =
            await response.json();

        document.getElementById(
            "result"
        ).innerHTML =
            formatAIResponse(
                data.response
            );

    } catch (error) {

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="error-card">

                <h2>Error</h2>

                <p>
                    ${error}
                </p>

            </div>
        `;
    }

    finally {

        hideLoader();
    }
}


// =====================
// Generate Runbook
// =====================

async function generateRunbook() {

    document.getElementById(
        "quizContainer"
    ).style.display = "none";

    document.getElementById(
        "result"
    ).style.display = "block";

    showLoader(
        "Creating Support Runbook"
    );

    try {

        const response =
            await fetch(
                `${API_URL}/runbook`
            );

        const data =
            await response.json();

        document.getElementById(
            "result"
        ).innerHTML =
            formatAIResponse(
                data.response
            );

    } catch (error) {

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="error-card">

                <h2>Error</h2>

                <p>
                    ${error}
                </p>

            </div>
        `;
    }

    finally {

        hideLoader();
    }
}


// =====================
// Generate Assessment
// =====================


async function generateAssessment() {

    resetQuiz();

    document.getElementById(
        "result"
    ).style.display = "none";

    document.getElementById(
        "quizContainer"
    ).style.display = "block";

    showLoader(
        "Generating Assessment"
    );

    try {

        const response =
            await fetch(
                `${API_URL}/assessment`
            );

        const data =
            await response.json();
        console.log(data.response);    

        parseAssessment(
            data.response
        );

    } catch (error) {

        document.getElementById(
            "quizContainer"
        ).style.display = "none";

        document.getElementById(
            "result"
        ).style.display = "block";

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="error-card">
                <h2>Error</h2>
                <p>${error}</p>
            </div>
        `;
    }

    finally {

        hideLoader();
    }
}


// =====================
// Ask Question
// =====================

async function askQuestion() {

    const question =
        document.getElementById(
            "question"
        ).value.trim();

    if (!question) {

        alert(
            "Please enter a question."
        );

        return;
    }

    showLoader(
        "Searching KT Knowledge"
    );

    try {

        const response =
            await fetch(
                `${API_URL}/ask?question=${encodeURIComponent(question)}`
            );

        const data =
            await response.json();

        document.getElementById(
            "result"
        ).innerHTML =
            formatAIResponse(
                data.response
            );

        document.getElementById(
            "question"
        ).value = "";

    } catch (error) {

        document.getElementById(
            "result"
        ).innerHTML = `
            <div class="error-card">

                <h2>Error</h2>

                <p>
                    ${error}
                </p>

            </div>
        `;
    }

    finally {

        hideLoader();
    }
}
function resetQuiz() {

    quizQuestions = [];
    currentQuestion = 0;
    score = 0;

    document.getElementById(
        "questionBox"
    ).innerHTML = "";

    document.getElementById(
        "optionsBox"
    ).innerHTML = "";

    document.getElementById(
        "feedbackBox"
    ).innerHTML = "";

    document.getElementById(
        "submitAnswerBtn"
    ).style.display =
        "inline-block";

    document.getElementById(
        "nextQuestionBtn"
    ).style.display =
        "none";
}


function parseAssessment(text) {

    const tempDiv =
        document.createElement("div");

    tempDiv.innerHTML = text;

    text =
        tempDiv.innerText;

    quizQuestions = [];

    currentQuestion = 0;

    score = 0;

    const questionBlocks =
        text.split(/Question\s+\d+:/i);

    questionBlocks.forEach(block => {

        if (!block.trim()) return;

        const answerMatch =
            block.match(
                /Answer:\s*(.+)/i
            );

        if (!answerMatch) return;

        const answer =
            answerMatch[1].trim();

        let lines =
            block
                .replace(
                    /Answer:.*/i,
                    ""
                )
                .split("\n")
                .map(line =>
                    line.trim()
                )
                .filter(line =>
                    line !== ""
                );

        const question =
            lines.shift();

        const options =
            lines.slice(0, 4);

        if (
            question &&
            options.length === 4
        ) {

            quizQuestions.push({

                question:

                    question,

                options:

                    options,

                answer:

                    answer

            });
        }

    });

    console.log(
        quizQuestions
    );

    if (
        quizQuestions.length === 0
    ) {

        alert(
            "No questions found in assessment."
        );

        return;
    }

    loadQuestion();
}

function loadQuestion() {

    const q =
        quizQuestions[currentQuestion];

    document.getElementById(
        "questionBox"
    ).innerHTML = `
        <h2>
            Question ${currentQuestion + 1}
        </h2>

        <p>${q.question}</p>
    `;

    let html = "";

    q.options.forEach(option => {

        html += `
            <label class="option-label">

                <input
                    type="radio"
                    name="quizOption"
                    value="${option}"
                >

                ${option}

            </label>
        `;
    });

    document.getElementById(
        "optionsBox"
    ).innerHTML = html;

    document.getElementById(
        "feedbackBox"
    ).innerHTML = "";

    document.getElementById(
        "submitAnswerBtn"
    ).style.display =
        "inline-block";

    document.getElementById(
        "nextQuestionBtn"
    ).style.display =
        "none";
}


function submitAnswer() {

    const selected =
        document.querySelector(
            'input[name="quizOption"]:checked'
        );

    if (!selected) {

        alert(
            "Please select an answer."
        );

        return;
    }

    const userAnswer =
        selected.value.trim();

    const correctAnswer =
        quizQuestions[currentQuestion]
        .answer;

    const correctText =
        correctAnswer
            .replace(/^([A-D]\))/, "")
            .trim();

    if (
        userAnswer.trim().toLowerCase() ===
        correctAnswer.trim().toLowerCase()
    ) {

        score++;

        document.getElementById(
            "feedbackBox"
        ).innerHTML = `
            <div class="correct-answer">
                ✅ Correct Answer
            </div>
        `;
    }
    else {

        document.getElementById(
            "feedbackBox"
        ).innerHTML = `
            <div class="wrong-answer">

                ❌ Incorrect Answer

                <br><br>

                Correct Answer:
                ${correctAnswer}

            </div>
        `;
    }

    document.getElementById(
        "submitAnswerBtn"
    ).style.display =
        "none";

    document.getElementById(
        "nextQuestionBtn"
    ).style.display =
        "inline-block";
}


function nextQuestion() {

    currentQuestion++;

    if (
        currentQuestion >=
        quizQuestions.length
    ) {

        const percentage =
            Math.round(
                (
                    score /
                    quizQuestions.length
                ) * 100
            );

        document.getElementById(
            "questionBox"
        ).innerHTML = `
            <div class="score-card">

                <h2>
                    🎉 Assessment Completed
                </h2>

                <div class="score">
                    ${score}/${quizQuestions.length}
                </div>

                <div class="percentage">
                    ${percentage}% Score
                </div>

            </div>
        `;

        document.getElementById(
            "optionsBox"
        ).innerHTML = "";

        document.getElementById(
            "feedbackBox"
        ).innerHTML = "";

        document.getElementById(
            "submitAnswerBtn"
        ).style.display = "none";

        document.getElementById(
            "nextQuestionBtn"
        ).style.display = "none";

        return;
    }

    loadQuestion();
}