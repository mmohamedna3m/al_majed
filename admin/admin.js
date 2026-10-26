/* =============================================
   منصة المجد — admin.js
   JavaScript مشترك لجميع صفحات لوحة التحكم
   ============================================= */

'use strict';

/* ------------------------------------------
   1. التحقق من صلاحية الأدمن
   ------------------------------------------ */
async function checkAdminAuth() {
    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        const user = data.user || data;
        if (!user || user.role !== 'admin') {
            throw new Error('Not admin');
        }
        // عرض اسم الأدمن في الهيدر
        const adminInfoEl = document.getElementById('adminInfo');
        if (adminInfoEl) {
            adminInfoEl.innerHTML = `
                <div class="admin-avatar">👤</div>
                <span class="admin-name">${escapeHtml(user.name || user.email)}</span>
                <span class="badge badge-admin">أدمن</span>
            `;
        }
        return user;
    } catch (err) {
        console.warn('Auth check failed:', err.message);
        window.location.href = '/';
        return null;
    }
}

/* ------------------------------------------
   2. المودال
   ------------------------------------------ */
function showModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.add('active');
        // إغلاق بالنقر خارج المودال
        overlay.addEventListener('click', function handler(e) {
            if (e.target === overlay) {
                hideModal(id);
                overlay.removeEventListener('click', handler);
            }
        });
        // إغلاق بـ Escape
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                hideModal(id);
                document.removeEventListener('keydown', escHandler);
            }
        });
    }
}

function hideModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.remove('active');
    }
}

/* ------------------------------------------
   3. التنبيهات (Toast Alerts)
   ------------------------------------------ */
let alertContainer = null;

function ensureAlertContainer() {
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'alertContainer';
        document.body.appendChild(alertContainer);
    }
}

/**
 * @param {string} message  - نص الرسالة
 * @param {'success'|'error'|'warning'|'info'} type - نوع الرسالة
 * @param {number} duration - مدة العرض بالمللي ثانية (افتراضي 3500)
 */
function showAlert(message, type = 'info', duration = 3500) {
    ensureAlertContainer();

    const icons = {
        success: '✅',
        error:   '❌',
        warning: '⚠️',
        info:    'ℹ️',
    };

    const toast = document.createElement('div');
    toast.className = `alert-toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${escapeHtml(message)}`;
    alertContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

/* ------------------------------------------
   4. تنسيق التواريخ (عربي)
   ------------------------------------------ */
function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', {
            year:  'numeric',
            month: 'long',
            day:   'numeric',
        });
    } catch {
        return dateString;
    }
}

function formatDateTime(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        return date.toLocaleString('ar-EG', {
            year:   'numeric',
            month:  'short',
            day:    'numeric',
            hour:   '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateString;
    }
}

/* ------------------------------------------
   5. تسجيل الخروج
   ------------------------------------------ */
async function handleLogout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;
    try {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
        });
    } catch (err) {
        console.warn('Logout request failed:', err);
    }
    window.location.href = '/';
}

/* ------------------------------------------
   6. أدوات مساعدة
   ------------------------------------------ */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * تحويل رابط يوتيوب لـ embed URL
 */
function toYoutubeEmbed(url) {
    if (!url) return null;
    // أشكال الروابط المدعومة:
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://www.youtube.com/embed/VIDEO_ID
    let videoId = null;

    const watchMatch = url.match(/[?&]v=([^&\s]+)/);
    if (watchMatch) videoId = watchMatch[1];

    const shortMatch = url.match(/youtu\.be\/([^?&\s]+)/);
    if (shortMatch) videoId = shortMatch[1];

    const embedMatch = url.match(/\/embed\/([^?&\s]+)/);
    if (embedMatch) videoId = embedMatch[1];

    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

/**
 * طلب API موحد مع إدارة الأخطاء
 */
async function apiRequest(url, options = {}) {
    const defaults = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
    };

    // لو بيرفع ملف (FormData) لا تضع Content-Type يدوياً
    if (options.body instanceof FormData) {
        delete defaults.headers['Content-Type'];
    }

    const config = { ...defaults, ...options };
    if (options.headers) {
        config.headers = { ...defaults.headers, ...options.headers };
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }
    }

    const res = await fetch(url, config);

    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = await res.text();
    }

    if (!res.ok) {
        const errorMsg = (typeof data === 'object' && data?.message)
            ? data.message
            : `خطأ في الطلب (${res.status})`;
        throw new Error(errorMsg);
    }

    // فك تغليف المصفوفات تلقائياً لتسهيل الاستخدام في الصفحات
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        if (Array.isArray(data.sections)) return data.sections;
        if (Array.isArray(data.courses)) return data.courses;
        if (Array.isArray(data.lessons)) return data.lessons;
        if (Array.isArray(data.students)) return data.students;
        if (Array.isArray(data.users)) return data.users;
        if (Array.isArray(data.exams)) return data.exams;
        if (Array.isArray(data.questions)) return data.questions;
    }

    return data;
}

/**
 * تمييز الرابط النشط في الـ Sidebar
 */
function highlightActiveNav() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

/**
 * تأكيد حذف
 */
function confirmDelete(message = 'هل أنت متأكد من الحذف؟ لا يمكن التراجع.') {
    return confirm(message);
}

/* ------------------------------------------
   7. تهيئة الصفحة عند التحميل
   ------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
    // التحقق من تسجيل الدخول
    checkAdminAuth();

    // تمييز الرابط النشط
    highlightActiveNav();

    // جعل بنر/لوجو المنصة يوجه للصفحة الرئيسية عند الضغط عليه في جميع صفحات الإدارة
    document.querySelectorAll('.sidebar-logo').forEach(el => {
        el.style.cursor = 'pointer';
        el.setAttribute('title', 'العودة للصفحة الرئيسية للمنصة');
        el.addEventListener('click', () => { window.location.href = '/'; });
    });

    // ربط أزرار تسجيل الخروج
    document.querySelectorAll('[data-logout], .logout-btn').forEach(btn => {
        btn.addEventListener('click', handleLogout);
    });

    // ربط أزرار إغلاق المودال
    document.querySelectorAll('.modal-close').forEach(btn => {
        const targetId = btn.getAttribute('data-modal');
        if (targetId) {
            btn.addEventListener('click', () => hideModal(targetId));
        }
    });
});
