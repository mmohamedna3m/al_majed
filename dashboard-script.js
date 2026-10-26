document.addEventListener('DOMContentLoaded', async () => {

    // ===== 1. تحقق من تسجيل الدخول =====
    let user = null;
    try {
        const res = await fetch('/api/me');
        if (!res.ok) {
            // توجيه للرئيسية مع فتح نافذة تسجيل الدخول بسلاسة
            window.location.href = '/?login=1';
            return;
        }
        const json = await res.json();
        user = json.user;
    } catch (err) {
        console.error('خطأ في جلب بيانات المستخدم:', err);
        window.location.href = '/?login=1';
        return;
    }

    // ===== 2. ملأ بيانات الـ sidebar =====
    document.getElementById('headerUserName').textContent = user.name;
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('profilePhone').textContent = user.phone || 'غير محدد';
    document.getElementById('profileJoinDate').textContent = formatDate(user.created_at);
    document.getElementById('avatarLetter').textContent = user.name ? user.name.charAt(0) : 'م';

    // ملأ نموذج التعديل
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editPhone').value = user.phone || '';

    // ===== 3. جلب الدورات وعرضها =====
    await loadMyCourses();

    // ===== 4. جلب نتائج الاختبارات =====
    await loadMyResults();

    // ===== 5. نموذج تعديل البيانات =====
    document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = e.target.querySelector('.btn-save');
        btn.disabled = true;
        btn.textContent = '⏳ جاري الحفظ...';

        const data = {
            name:  document.getElementById('editName').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            phone: document.getElementById('editPhone').value.trim()
        };

        const msgEl = document.getElementById('editMsg');

        try {
            const r = await fetch('/api/users/me', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await r.json();

            if (result.success) {
                msgEl.textContent = '✅ تم حفظ التغييرات بنجاح!';
                msgEl.className = 'edit-msg success';

                // تحديث العرض الفوري
                document.getElementById('profileName').textContent = data.name;
                document.getElementById('profileEmail').textContent = data.email;
                document.getElementById('profilePhone').textContent = data.phone || 'غير محدد';
                document.getElementById('headerUserName').textContent = data.name;
                document.getElementById('avatarLetter').textContent = data.name ? data.name.charAt(0) : 'م';
            } else {
                msgEl.textContent = '❌ ' + (result.message || 'حدث خطأ غير متوقع');
                msgEl.className = 'edit-msg error';
            }
        } catch (err) {
            msgEl.textContent = '❌ خطأ في الاتصال بالخادم';
            msgEl.className = 'edit-msg error';
        }

        btn.disabled = false;
        btn.textContent = '💾 حفظ التغييرات';
        setTimeout(() => { msgEl.textContent = ''; msgEl.className = 'edit-msg'; }, 3500);
    });
});


// ===== تحميل الدورات =====
async function loadMyCourses() {
    const grid = document.getElementById('myCoursesGrid');
    const countEl = document.getElementById('coursesCount');

    try {
        const res = await fetch('/api/enrollments/me');
        if (!res.ok) throw new Error('فشل جلب الدورات');
        const data = await res.json();

        const courses = data.courses || [];
        countEl.textContent = courses.length;

        if (courses.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📚</span>
                    <p>أنت غير مشترك في أي دورة حالياً</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = courses.map(c => {
            const thumbSrc = c.thumbnail ? (c.thumbnail.startsWith('/') ? c.thumbnail : (c.thumbnail.startsWith('uploads/') ? `/${c.thumbnail}` : `/uploads/images/${c.thumbnail}`)) : null;
            const thumb = thumbSrc
                ? `<img src="${thumbSrc}" alt="${escapeHtml(c.title)}" class="course-thumb" onerror="this.outerHTML='<div class=\\'course-thumb-placeholder\\'>📚</div>'">`
                : `<div class="course-thumb-placeholder">📚</div>`;

            const section = c.section_title
                ? `<span class="course-section-badge">${escapeHtml(c.section_title)}</span>`
                : '';

            return `
                <div class="course-card">
                    ${thumb}
                    <div class="course-info">
                        ${section}
                        <h3 class="course-title">${escapeHtml(c.title)}</h3>
                        <p class="course-desc">${escapeHtml(c.description || '')}</p>
                        <a href="course.html?id=${c.id}" class="btn-enter-course">ادخل الدورة ←</a>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('خطأ في تحميل الدورات:', err);
        grid.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⚠️</span>
                <p>تعذّر تحميل الدورات. يرجى تحديث الصفحة.</p>
            </div>
        `;
    }
}


// ===== تحميل نتائج الاختبارات =====
async function loadMyResults() {
    const tbody = document.getElementById('resultsTableBody');
    const countEl = document.getElementById('examsCount');

    try {
        const res = await fetch('/api/results/me');
        if (!res.ok) throw new Error('فشل جلب النتائج');
        const data = await res.json();

        const results = data.results || [];
        countEl.textContent = results.length;

        if (results.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="loading-cell">لم تؤدِ أي اختبار بعد 📝</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = results.map(r => {
            const total   = r.total || 1;
            const score   = r.score || 0;
            const percent = Math.round((score / total) * 100);
            const passed  = score >= (r.pass_score || (total * 0.5));

            return `
                <tr>
                    <td>${escapeHtml(r.exam_title || '—')}</td>
                    <td>${score}</td>
                    <td>${total}</td>
                    <td><span class="badge-percent">${percent}%</span></td>
                    <td>
                        <span class="${passed ? 'badge-pass' : 'badge-fail'}">
                            ${passed ? 'ناجح ✅' : 'راسب ❌'}
                        </span>
                    </td>
                    <td>${formatDate(r.taken_at)}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('خطأ في تحميل النتائج:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-cell">⚠️ تعذّر تحميل النتائج</td>
            </tr>
        `;
    }
}


// ===== تسجيل الخروج =====
function handleLogout() {
    if (!confirm('هل تريد تسجيل الخروج؟')) return;
    fetch('/api/logout', { method: 'POST' })
        .then(() => { window.location.href = '/'; })
        .catch(() => { window.location.href = '/'; });
}


// ===== مساعدات =====
function formatDate(dateStr) {
    if (!dateStr) return 'غير معروف';
    try {
        return new Date(dateStr).toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
