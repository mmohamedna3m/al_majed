// فتح وإغلاق القائمة والـ Modals
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function toggleLoginModal() {
    const modal = document.getElementById('loginModal');
    const overlay = document.getElementById('overlay');
    modal.classList.toggle('show');
    overlay.classList.toggle('show');
    if(modal.classList.contains('show')) { switchAuthView('login'); }
}

function switchAuthView(view) {
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    if (view === 'register') { loginView.style.display = 'none'; registerView.style.display = 'block'; } 
    else { loginView.style.display = 'block'; registerView.style.display = 'none'; }
}

function closeAllOverlays() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('loginModal').classList.remove('show');
    document.getElementById('overlay').classList.remove('show');
}

// ----------------==================================================----------------
// فحص حالة المستخدم عند تحميل الموقع للتحكم بالأيقونة والـ Tooltip
// ----------------==================================================----------------
document.addEventListener('DOMContentLoaded', () => {
    checkUserAuthStatus();
    loadHomeCourses();

    // فحص ما إذا كان المستخدم قادماً من صفحة تتطلب تسجيل الدخول
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === '1') {
        setTimeout(() => {
            toggleLoginModal();
            const toast = document.getElementById('welcomeToast');
            if (toast) {
                toast.innerText = '🔒 يرجى تسجيل الدخول أولاً للوصول إلى لوحة التحكم';
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 4500);
            }
        }, 300);
    }
});

async function checkUserAuthStatus() {
    let sessionUser = JSON.parse(sessionStorage.getItem('studentUser'));
    const loginBtn = document.getElementById('loginTriggerBtn');
    const tooltipText = document.getElementById('authTooltipText');

    // تحقق من السيرفر للتأكد من الجلسة
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            if (data && data.user) {
                sessionUser = {
                    name: data.user.name,
                    email: data.user.email,
                    role: data.user.role,
                    joinDate: data.user.created_at || "أكتوبر 2026"
                };
                sessionStorage.setItem('studentUser', JSON.stringify(sessionUser));
            }
        } else {
            sessionStorage.removeItem('studentUser');
            sessionUser = null;
        }
    } catch (e) {
        // في حال عدم عمل السيرفر نعتمد على sessionStorage
    }

    if (sessionUser) {
        if (sessionUser.role === 'admin') {
            loginBtn.innerHTML = "👑";
            loginBtn.classList.add('logged-in');
            tooltipText.innerText = "لوحة تحكم الأدمن";

            if (!document.getElementById('adminSidebarLink')) {
                const sidebarLinks = document.getElementById('sidebar-links');
                if (sidebarLinks) {
                    const li = document.createElement('li');
                    li.id = 'adminSidebarLink';
                    li.innerHTML = '<a href="./admin/index.html" style="color:#d4af37; font-weight:bold;">👑 لوحة تحكم الأدمن</a>';
                    sidebarLinks.insertBefore(li, sidebarLinks.children[1] || null);
                }
            }
        } else {
            loginBtn.innerHTML = "🎓"; // تحول الأيقونة لقبعة التخرج الذكية
            loginBtn.classList.add('logged-in');
            tooltipText.innerText = "الملف الشخصي";
        }
    } else {
        loginBtn.innerHTML = "👤"; // الأيقونة الافتراضية للزوار
        loginBtn.classList.remove('logged-in');
        tooltipText.innerText = "تسجيل الدخول";
    }
}

function handleAuthIconClick() {
    const sessionUser = JSON.parse(sessionStorage.getItem('studentUser'));
    if (sessionUser) {
        if (sessionUser.role === 'admin') {
            window.location.href = './admin/index.html';
        } else {
            window.location.href = './dashboard.html';
        }
    } else {
        toggleLoginModal();
    }
}

// الاتصال مع السيرفر و MySQL لإنشاء حساب حقيقي وتسجيل الدخول
function handleRegister(event) {
    event.preventDefault();
    const inputs = event.target.querySelectorAll('input');
    const name = inputs[0].value.trim();
    const email = inputs[1].value.trim();
    const password = inputs[2].value;

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            sessionStorage.setItem('studentUser', JSON.stringify({
                name: data.user ? data.user.name : name,
                email: data.user ? data.user.email : email,
                role: 'student',
                joinDate: 'أكتوبر 2026'
            }));
            alert(`🎉 تم إنشاء حسابك بنجاح! مرحباً بك يا ${name}.`);
            closeAllOverlays();
            checkUserAuthStatus();
            setTimeout(() => {
                window.location.href = './dashboard.html';
            }, 500);
        } else {
            alert("⚠️ " + (data.message || "حدث خطأ أثناء إنشاء الحساب"));
        }
    })
    .catch(err => {
        console.error('Registration error:', err);
        alert("فشل الاتصال بالسيرفر، تأكد من تشغيل server.js وقاعدة البيانات.");
    });
}

function handleLogin(event) {
    event.preventDefault();
    const inputs = event.target.querySelectorAll('input');
    const email = inputs[0].value; const password = inputs[1].value;

    fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // حفظ تفاصيل الانضمام الحقيقية القادمة من قاعدة البيانات بداخل الجلسة
            const role = data.user.role || 'student';
            sessionStorage.setItem('studentUser', JSON.stringify({
                name: data.user.name,
                email: email,
                role: role,
                joinDate: data.user.created_at || "أكتوبر 2026"
            }));
            
            alert(`مرحباً بك مجدداً: ${data.user.name} 👋`);
            closeAllOverlays();
            checkUserAuthStatus();

            setTimeout(() => {
                if (role === 'admin') {
                    window.location.href = './admin/index.html';
                } else {
                    window.location.href = './dashboard.html';
                }
            }, 600);
        } else { 
            alert("خطأ في تسجيل الدخول: " + data.message); 
        }
    })
    .catch(err => {
        alert("فشل الاتصال بالسيرفر");
    });
}

function handleTelegramAuth() {
    fetch('/api/telegram-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            sessionStorage.setItem('studentUser', JSON.stringify({
                name: data.user.name,
                email: 'telegram_student@elmajd.com',
                role: 'student',
                joinDate: 'أكتوبر 2026'
            }));
            checkUserAuthStatus();
            alert(`مرحباً بك: ${data.user.name} 👋 تم تسجيل الدخول بنجاح!`);
            window.location.href = './dashboard.html';
        } else {
            alert('فشل تسجيل الدخول عبر تليجرام');
        }
    })
    .catch(() => {
        alert('فشل الاتصال بالسيرفر');
    });
}

function handleDashboardNav(event) {
    const sessionUser = JSON.parse(sessionStorage.getItem('studentUser'));
    if (!sessionUser) {
        event.preventDefault();
        toggleSidebar();
        toggleLoginModal();
    }
}

// ------------------------------------------------------------------
// جزيئات الخلفية الرقمية التفاعلية مع الماوس (الابتعاد والملاحقة)
// ------------------------------------------------------------------
const canvas = document.getElementById('mathCanvas'); const ctx = canvas.getContext('2d');
let particlesArray = []; let trailArray = []; const mouse = { x: null, y: null, radius: 120 };

window.addEventListener('mousemove', function(event) {
    mouse.x = event.x; mouse.y = event.y;
    if (Math.random() < 0.4) { trailArray.push(new TrailParticle(mouse.x, mouse.y)); }
});
window.addEventListener('mouseout', function() { mouse.x = null; mouse.y = null; });

const mathSymbols = ['100%', 'x+y', 'π', '√', '5²', '÷', '×', 'Σ', 'Δ', '99', 'f(x)', '%', 'log', '½'];

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; initBackgroundParticles(); }
window.addEventListener('resize', resizeCanvas);

class BackgroundParticle {
    constructor(x, y) {
        this.x = x; this.y = y; this.baseX = x; this.baseY = y;
        this.text = mathSymbols[Math.floor(Math.random() * mathSymbols.length)];
        this.size = Math.random() * 6 + 12; this.density = (Math.random() * 30) + 15; 
    }
    draw() { ctx.fillStyle = 'rgba(212, 175, 55, 0.18)'; ctx.font = `bold ${this.size}px Courier New`; ctx.fillText(this.text, this.x, this.y); }
    update() {
        let dx = mouse.x - this.x; let dy = mouse.y - this.y; let distance = Math.hypot(dx, dy);
        let forceDirectionX = dx / distance; let forceDirectionY = dy / distance;
        let maxDistance = mouse.radius; let force = (maxDistance - distance) / maxDistance;
        let directionX = forceDirectionX * force * this.density; let directionY = forceDirectionY * force * this.density;
        if (distance < mouse.radius) { this.x -= directionX; this.y -= directionY; } 
        else {
            if (this.x !== this.baseX) { let dxBack = this.x - this.baseX; this.x -= dxBack / 15; }
            if (this.y !== this.baseY) { let dyBack = this.y - this.baseY; this.y -= dyBack / 15; }
        }
    }
}

class TrailParticle {
    constructor(x, y) {
        this.x = x; this.y = y; this.speedX = (Math.random() * 2) - 1; this.speedY = (Math.random() * 2) - 1;
        this.text = mathSymbols[Math.floor(Math.random() * mathSymbols.length)]; this.size = Math.random() * 8 + 14; this.opacity = 1; 
    }
    draw() { ctx.fillStyle = `rgba(0, 210, 211, ${this.opacity})`; ctx.font = `bold ${this.size}px Arial`; ctx.fillText(this.text, this.x, this.y); }
    update() { this.x += this.speedX; this.y += this.speedY; this.opacity -= 0.02; }
}

function initBackgroundParticles() {
    particlesArray = []; let numberOfParticles = (canvas.width * canvas.height) / 7000; 
    for (let i = 0; i < numberOfParticles; i++) {
        let x = Math.random() * canvas.width; let y = Math.random() * canvas.height;
        particlesArray.push(new BackgroundParticle(x, y));
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < particlesArray.length; i++) { particlesArray[i].draw(); particlesArray[i].update(); }
    for (let i = 0; i < trailArray.length; i++) {
        trailArray[i].draw(); trailArray[i].update();
        if (trailArray[i].opacity <= 0) { trailArray.splice(i, 1); i--; }
    }
    requestAnimationFrame(animate);
}

window.addEventListener('DOMContentLoaded', () => {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    initBackgroundParticles(); animate();
    setTimeout(() => { document.getElementById('welcomeToast').classList.add('show'); }, 500); 
    setTimeout(() => { document.getElementById('welcomeToast').classList.remove('show'); }, 4500); 
});


// ------------------------------------------------------------------
// تحميل وعرض الدورات التدريبية في الصفحة الرئيسية
// ------------------------------------------------------------------
async function loadHomeCourses() {
    const grid = document.getElementById('homeCoursesGrid');
    if (!grid) return;

    try {
        const res = await fetch('/api/courses');
        const data = await res.json();
        const courses = Array.isArray(data) ? data : (data.courses || []);

        if (!courses || courses.length === 0) {
            grid.innerHTML = `
                <div class="no-courses-box">
                    <p style="font-size:1.1rem; margin:0;">📚 لا توجد دورات تدريبية معروضة حالياً، ترقبوا إطلاق أولى الدورات قريباً!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = courses.map(c => {
            let thumbUrl = 'img/logo.png';
            if (c.thumbnail) {
                thumbUrl = c.thumbnail.startsWith('/') ? c.thumbnail : '/' + c.thumbnail;
            }
            const price = parseFloat(c.price);
            const priceTag = (price > 0) ? `${price} ر.س` : 'مجانية';

            return `
                <div class="home-course-card" onclick="handleCourseClick(${c.id})">
                    <span class="course-badge-sec">${escapeHtml(c.section_title || 'دورة قدرات')}</span>
                    <div class="home-course-thumb-wrap">
                        <img src="${thumbUrl}" alt="${escapeHtml(c.title)}" class="home-course-img" onerror="this.src='img/logo.png'">
                    </div>
                    <div class="home-course-body">
                        <h3 class="home-course-title">${escapeHtml(c.title)}</h3>
                        <p class="home-course-desc">${escapeHtml(c.description || 'شرح تفصيلي وتدريبات شاملة على نماذج المحوسب والتأسيس للوصول لأعلى نسبة.')}</p>
                        <div class="home-course-footer">
                            <span class="home-course-price">${priceTag}</span>
                            <button class="btn-enroll-home">عرض الدورة 🚀</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Home courses load error:', err);
        grid.innerHTML = `
            <div class="no-courses-box">
                <p>تعذر تحميل الدورات في الوقت الحالي، يرجى إعادة المحاولة لاحقاً.</p>
            </div>
        `;
    }
}

function handleCourseClick(courseId) {
    window.location.href = `./course.html?id=${courseId}`;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
