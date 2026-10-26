const examId = new URLSearchParams(window.location.search).get('id');

let questions    = [];
let answers      = {};
let currentIndex = 0;
let timerInterval  = null;
let secondsLeft  = 0;
let examData     = {};
let examStarted  = false;

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {

    if (!examId) {
        alert('لم يتم تحديد الاختبار');
        window.location.href = 'dashboard.html';
        return;
    }

    // تحقق من تسجيل الدخول
    try {
        const meRes = await fetch('/api/me');
        if (!meRes.ok) { window.location.href = '/'; return; }
    } catch {
        window.location.href = '/';
        return;
    }

    // جلب بيانات الاختبار
    try {
        const res  = await fetch(`/api/exams/${examId}/take`);
        if (!res.ok) throw new Error('فشل جلب الاختبار');
        const data = await res.json();
        examData  = data.exam;
        questions = data.questions || (data.exam && data.exam.questions) || [];

        // ملأ معلومات المقدمة
        document.getElementById('examTitle').textContent       = examData.title;
        document.getElementById('introTitle').textContent      = examData.title;
        document.getElementById('introDuration').textContent   = `${examData.duration_minutes} دقيقة`;
        document.getElementById('introQuestions').textContent  = `${questions.length} سؤال`;
        document.getElementById('introPassScore').textContent  = `${examData.pass_score}%`;
        document.getElementById('totalQ').textContent          = questions.length;

        document.getElementById('startExamBtn').onclick = startExam;

    } catch (err) {
        console.error('خطأ في تحميل الاختبار:', err);
        document.getElementById('introTitle').textContent = '⚠️ تعذّر تحميل الاختبار';
        document.getElementById('startExamBtn').disabled = true;
    }
});


// ===== بدء الاختبار =====
function startExam() {
    examStarted = true;
    document.getElementById('examIntro').style.display     = 'none';
    document.getElementById('examQuestions').style.display = 'block';

    // بدء العداد
    secondsLeft = (examData.duration_minutes || 30) * 60;
    startTimer();

    // عرض السؤال الأول
    renderQuestion(0);
    renderDots();
}


// ===== العداد =====
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        secondsLeft--;
        updateTimerDisplay();

        if (secondsLeft === 60) {
            document.getElementById('timerBox').classList.add('timer-warning');
        }

        if (secondsLeft <= 0) {
            clearInterval(timerInterval);
            submitExam(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
    const s = (secondsLeft % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').textContent = `${m}:${s}`;
}


// ===== عرض السؤال =====
function renderQuestion(index) {
    currentIndex = index;
    const q = questions[index];
    if (!q) return;

    document.getElementById('questionNum').textContent  = `السؤال ${index + 1}`;
    document.getElementById('questionText').textContent = q.question_text;
    document.getElementById('currentQ').textContent     = index + 1;

    // شريط التقدم
    const pct = ((index + 1) / questions.length) * 100;
    document.getElementById('progressFill').style.width = `${pct}%`;

    // الخيارات
    const allOptions = [
        { key: 'A', text: q.option_a, label: 'أ' },
        { key: 'B', text: q.option_b, label: 'ب' },
        { key: 'C', text: q.option_c, label: 'ج' },
        { key: 'D', text: q.option_d, label: 'د' }
    ].filter(o => o.text && o.text.trim() !== '');

    document.getElementById('optionsGrid').innerHTML = allOptions.map(o => `
        <div class="option-item ${answers[q.id] === o.key ? 'selected' : ''}"
             onclick="selectAnswer(${q.id}, '${o.key}', this)">
            <span class="option-label">${o.label}</span>
            <span class="option-text">${escapeHtml(o.text)}</span>
        </div>
    `).join('');

    // أزرار التنقل
    const isLast = index === questions.length - 1;
    document.getElementById('prevBtn').disabled               = index === 0;
    document.getElementById('nextBtn').style.display          = isLast ? 'none'  : 'block';
    document.getElementById('submitBtn').style.display        = isLast ? 'block' : 'none';

    updateDots();
}


// ===== اختيار إجابة =====
function selectAnswer(questionId, answer, el) {
    answers[questionId] = answer;

    // تحديث التحديد بصرياً
    document.querySelectorAll('.option-item').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');

    updateDots();
}


// ===== التنقل =====
function nextQuestion() {
    if (currentIndex < questions.length - 1) renderQuestion(currentIndex + 1);
}

function prevQuestion() {
    if (currentIndex > 0) renderQuestion(currentIndex - 1);
}


// ===== نقاط الأسئلة =====
function renderDots() {
    document.getElementById('questionsDots').innerHTML = questions.map((q, i) => {
        const isAnswered = !!answers[q.id];
        const isCurrent  = i === currentIndex;
        let cls = 'dot';
        if (isAnswered) cls += ' answered';
        if (isCurrent)  cls += ' current';
        return `<div class="${cls}" onclick="renderQuestion(${i})">${i + 1}</div>`;
    }).join('');
}

function updateDots() { renderDots(); }


// ===== تسليم الاختبار =====
async function submitExam(autoSubmit = false) {
    if (!examStarted) return;

    const answeredCount   = Object.keys(answers).length;
    const unansweredCount = questions.length - answeredCount;

    if (!autoSubmit && unansweredCount > 0) {
        const proceed = confirm(
            `لم تجب على ${unansweredCount} سؤال. هل تريد التسليم الآن؟`
        );
        if (!proceed) return;
    }

    clearInterval(timerInterval);

    // إظهار حالة تحميل
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        submitBtn.disabled     = true;
        submitBtn.textContent  = '⏳ جاري التسليم...';
    }

    try {
        const res = await fetch(`/api/exams/${examId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        if (!res.ok) throw new Error('فشل التسليم');
        const result = await res.json();

        // عرض النتيجة
        document.getElementById('examQuestions').style.display = 'none';
        document.getElementById('examResult').style.display    = 'flex';

        const total   = result.total || questions.length;
        const score   = result.score  || 0;
        const percent = total > 0 ? Math.round((score / total) * 100) : 0;

        document.getElementById('resultPercent').textContent = `${percent}%`;
        document.getElementById('resultScore').textContent   = score;
        document.getElementById('resultTotal').textContent   = total;

        const circle     = document.getElementById('resultCircle');
        const titleEl    = document.getElementById('resultTitle');

        if (result.passed) {
            circle.classList.add('passed');
            titleEl.textContent = '🎉 مبروك! لقد نجحت في الاختبار';
        } else {
            circle.classList.add('failed');
            titleEl.textContent = '😔 لم تنجح هذه المرة، حاول مجدداً';
        }

    } catch (err) {
        console.error('خطأ في تسليم الاختبار:', err);
        alert('❌ تعذّر تسليم الاختبار. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.');
        if (submitBtn) {
            submitBtn.disabled    = false;
            submitBtn.textContent = '📤 تسليم الاختبار';
        }
    }
}


// ===== مساعدات =====
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
