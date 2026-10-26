const params   = new URLSearchParams(window.location.search);
const courseId = params.get('id');

document.addEventListener('DOMContentLoaded', async () => {

    // تحقق من وجود معرف الدورة
    if (!courseId) {
        alert('لم يتم تحديد الدورة');
        window.location.href = 'dashboard.html';
        return;
    }

    // التحقق من حالة المستخدم (اختياري - دون منع الزائر أو غير المشترك من رؤية الدورة)
    try {
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
            const meData = await meRes.json();
            window.currentUser = meData.user || meData;
        }
    } catch {
        // زائر غير مسجل - يكمل استعراض الدورة بحرية
    }

    // جلب بيانات الدورة
    await loadCourse();

    // جلب الدروس
    await loadLessons();

    // جلب الاختبارات
    await loadExams();
});


// ===== جلب بيانات الدورة =====
async function loadCourse() {
    try {
        const res  = await fetch(`/api/courses/${courseId}`);
        if (!res.ok) throw new Error('فشل جلب الدورة');
        const data = await res.json();
        const c    = data.course;

        document.title = `${c.title} - منصة المجد`;
        document.getElementById('courseTitle').textContent       = c.title || 'دورة بدون عنوان';
        document.getElementById('courseDesc').textContent        = c.description || '';
        document.getElementById('courseSectionBadge').textContent = c.section_title || 'دورة';

    } catch (err) {
        console.error('خطأ في تحميل الدورة:', err);
        document.getElementById('courseTitle').textContent = 'تعذّر تحميل الدورة';
    }
}


// ===== جلب الدروس =====
async function loadLessons() {
    const grid = document.getElementById('lessonsGrid');
    try {
        const res  = await fetch(`/api/lessons?course_id=${courseId}`);
        if (!res.ok) throw new Error('فشل جلب الدروس');
        const data = await res.json();
        const lessons = data.lessons || [];

        if (lessons.length === 0) {
            grid.innerHTML = '<div class="empty-ph">📭 لا توجد دروس في هذه الدورة حالياً</div>';
            return;
        }

        grid.innerHTML = lessons.map((l, i) => {
            const metaTags = [
                l.video_url ? '<span class="meta-tag meta-video">🎬 فيديو</span>' : '',
                l.pdf       ? '<span class="meta-tag meta-pdf">📄 ملف</span>'    : ''
            ].filter(Boolean).join('');

            return `
                <a href="lesson.html?id=${l.id}&course_id=${courseId}" class="lesson-card">
                    <div class="lesson-num-badge">${i + 1}</div>
                    <div class="lesson-card-info">
                        <div class="lesson-card-title">${escapeHtml(l.title)}</div>
                        <div class="lesson-card-meta">${metaTags || '<span class="meta-tag" style="color:var(--text-secondary);font-size:0.75rem;">درس نصي</span>'}</div>
                    </div>
                </a>
            `;
        }).join('');

    } catch (err) {
        console.error('خطأ في تحميل الدروس:', err);
        grid.innerHTML = '<div class="empty-ph">⚠️ تعذّر تحميل الدروس. يرجى تحديث الصفحة.</div>';
    }
}


// ===== جلب الاختبارات =====
async function loadExams() {
    const grid = document.getElementById('examsGrid');
    try {
        const res  = await fetch(`/api/exams?course_id=${courseId}`);
        if (!res.ok) throw new Error('فشل جلب الاختبارات');
        const data = await res.json();
        const exams = data.exams || [];

        if (exams.length === 0) {
            grid.innerHTML = '<div class="empty-ph">📭 لا توجد اختبارات لهذه الدورة حالياً</div>';
            return;
        }

        grid.innerHTML = exams.map(e => `
            <div class="exam-card">
                <div class="exam-card-title">${escapeHtml(e.title)}</div>
                <div class="exam-meta-row">
                    <div class="exam-meta-item">
                        <span class="exam-meta-label">⏱️ المدة</span>
                        <span class="exam-meta-val">${e.duration_minutes} دقيقة</span>
                    </div>
                    <div class="exam-meta-item">
                        <span class="exam-meta-label">📝 الأسئلة</span>
                        <span class="exam-meta-val">${e.questions_count || '—'} سؤال</span>
                    </div>
                    <div class="exam-meta-item">
                        <span class="exam-meta-label">✅ النجاح</span>
                        <span class="exam-meta-val">${e.pass_score}%</span>
                    </div>
                </div>
                <a href="exam.html?id=${e.id}" class="btn-start-exam">🚀 ابدأ الاختبار</a>
            </div>
        `).join('');

    } catch (err) {
        console.error('خطأ في تحميل الاختبارات:', err);
        grid.innerHTML = '<div class="empty-ph">⚠️ تعذّر تحميل الاختبارات.</div>';
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
