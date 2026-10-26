const params   = new URLSearchParams(window.location.search);
const lessonId = params.get('id');
const courseId = params.get('course_id');
let currentPdfId = null;

document.addEventListener('DOMContentLoaded', async () => {

    if (!lessonId) {
        alert('لم يتم تحديد الدرس');
        window.location.href = 'dashboard.html';
        return;
    }

    // فحص المستخدم إن وجد (اختياري)
    try {
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
            const meData = await meRes.json();
            window.currentUser = meData.user || meData;
        }
    } catch {
        // زائر أو طالب غير مشترك - يستمر بمشاهدة الدرس
    }

    // جلب بيانات الدرس
    await loadLesson();

    // جلب قائمة دروس الدورة للـ sidebar
    if (courseId) {
        await loadLessonsList();
    } else {
        document.getElementById('lessonsNav').style.display = 'none';
    }
});


// ===== تحميل بيانات الدرس =====
async function loadLesson() {
    try {
        const res  = await fetch(`/api/lessons/${lessonId}`);
        if (!res.ok) throw new Error('فشل جلب الدرس');
        const data = await res.json();
        const lesson = data.lesson;

        // العنوان
        document.getElementById('lessonTitle').textContent = lesson.title || 'درس';
        document.title = `${lesson.title} - منصة المجد`;

        // اسم الدورة
        if (lesson.course_title) {
            document.getElementById('courseName').textContent = lesson.course_title;
        }

        // الفيديو
        if (lesson.video_url) {
            const embedUrl = convertToEmbed(lesson.video_url);
            document.getElementById('videoWrapper').innerHTML =
                `<iframe src="${embedUrl}" allowfullscreen allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
        }

        // المحتوى النصي
        if (lesson.content) {
            const textBlock = document.getElementById('lessonText');
            textBlock.innerHTML = `<div class="text-content">${lesson.content}</div>`;
        } else {
            document.getElementById('lessonText').style.display = 'none';
        }

        // PDF
        if (lesson.pdf && lesson.pdf.id) {
            currentPdfId = lesson.pdf.id;
            await loadStudentPdf(lesson.pdf.id);
            document.getElementById('pdfSection').style.display = 'block';
        }

    } catch (err) {
        console.error('خطأ في تحميل الدرس:', err);
        document.getElementById('lessonTitle').textContent = 'تعذّر تحميل الدرس';
    }
}


// ===== تحميل ملف PDF الطالب =====
async function loadStudentPdf(pdfId) {
    try {
        const res  = await fetch(`/api/student-pdf/${pdfId}`);
        const data = await res.json();

        if (data.success && data.url) {
            document.getElementById('pdfViewer').src = data.url;
            document.getElementById('downloadPdfBtn').onclick = () => {
                window.open(`/api/student-pdf/${pdfId}/download`, '_blank');
            };
        } else {
            // إخفاء قسم PDF إن لم يكن متاحاً
            document.getElementById('pdfSection').style.display = 'none';
        }
    } catch (err) {
        console.error('خطأ في تحميل PDF:', err);
        document.getElementById('pdfSection').style.display = 'none';
    }
}


// ===== تحميل قائمة دروس الدورة =====
async function loadLessonsList() {
    const container = document.getElementById('lessonsList');
    try {
        const res  = await fetch(`/api/lessons?course_id=${courseId}`);
        if (!res.ok) throw new Error('فشل جلب الدروس');
        const data = await res.json();
        const lessons = data.lessons || [];

        if (lessons.length === 0) {
            container.innerHTML = '<div class="nav-loading">لا توجد دروس أخرى</div>';
            return;
        }

        container.innerHTML = lessons.map((l, i) => `
            <div class="lesson-nav-item ${String(l.id) === String(lessonId) ? 'active' : ''}"
                 onclick="navigateToLesson(${l.id})">
                <span class="lesson-num">${i + 1}</span>
                <span class="lesson-nav-title">${escapeHtml(l.title)}</span>
                ${l.video_url ? '<span class="has-video">🎬</span>' : ''}
                ${l.pdf      ? '<span class="has-pdf">📄</span>'   : ''}
            </div>
        `).join('');

    } catch (err) {
        console.error('خطأ في تحميل قائمة الدروس:', err);
        container.innerHTML = '<div class="nav-loading">⚠️ تعذّر تحميل القائمة</div>';
    }
}

function navigateToLesson(id) {
    window.location.href = `lesson.html?id=${id}&course_id=${courseId}`;
}


// ===== تحويل رابط يوتيوب إلى Embed =====
function convertToEmbed(url) {
    if (!url) return '';

    // youtube.com/watch?v=ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;

    // youtu.be/ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;

    // youtube.com/embed/ID (already embed)
    if (url.includes('youtube.com/embed/')) return url;

    // رابط آخر (Vimeo وغيره) — إرجاعه كما هو
    return url;
}


// ===== مساعدات =====
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
