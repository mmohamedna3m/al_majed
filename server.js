// ============================================================
// server.js — السيرفر الكامل لمنصة المجد للقدرات
// ============================================================

const express    = require('express');
const mysql      = require('mysql2');
const bodyParser = require('body-parser');
const bcrypt     = require('bcryptjs');
const session    = require('express-session');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');
const { PDFDocument } = require('pdf-lib');
const { requireLogin, requireAdmin } = require('./middleware/auth');

const app  = express();
const PORT = 3000;

// ============================================================
// إعدادات Middleware الأساسية
// ============================================================
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================================
// إعدادات الـ Session
// ============================================================
app.use(session({
    secret: 'almajd-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 ساعة
}));

// ============================================================
// إعدادات Static Files
// ============================================================
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// إعدادات Multer — رفع الملفات
// ============================================================

// تأكد من وجود المجلدات
const uploadDirs = [
    path.join(__dirname, 'uploads', 'pdfs'),
    path.join(__dirname, 'uploads', 'images'),
    path.join(__dirname, 'uploads', 'student-pdfs')
];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Storage للـ PDF
const pdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads', 'pdfs'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});

// Storage للصور
const imageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads', 'images'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, uuidv4() + ext);
    }
});

const uploadPdf   = multer({ storage: pdfStorage,   fileFilter: (req, file, cb) => { cb(null, true); } });
const uploadImage = multer({ storage: imageStorage, fileFilter: (req, file, cb) => { cb(null, true); } });

// ============================================================
// اتصال MySQL
// ============================================================
const db = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'qudurat_db',
    charset  : 'utf8mb4'
});

db.connect((err) => {
    if (err) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
        process.exit(1);
    }
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
    createTables();
});

// ============================================================
// دالة createTables — إنشاء الجداول
// ============================================================
function createTables() {
    const queries = [
        // جدول المستخدمين
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            role ENUM('student','admin') DEFAULT 'student',
            avatar VARCHAR(255),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الأقسام
        `CREATE TABLE IF NOT EXISTS sections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            icon VARCHAR(10) DEFAULT '📚',
            order_num INT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الدورات
        `CREATE TABLE IF NOT EXISTS courses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            section_id INT,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) DEFAULT 0,
            thumbnail VARCHAR(255),
            order_num INT DEFAULT 0,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الدروس
        `CREATE TABLE IF NOT EXISTS lessons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            video_url VARCHAR(500),
            content TEXT,
            order_num INT DEFAULT 0,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول ملفات PDF الأصلية
        `CREATE TABLE IF NOT EXISTS pdfs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lesson_id INT NOT NULL,
            filename VARCHAR(255) NOT NULL,
            original_path VARCHAR(500) NOT NULL,
            FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول النسخ الشخصية من PDF
        `CREATE TABLE IF NOT EXISTS student_pdfs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            pdf_id INT NOT NULL,
            personal_path VARCHAR(500) NOT NULL,
            last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_student_pdf (user_id, pdf_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (pdf_id) REFERENCES pdfs(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الاشتراكات
        `CREATE TABLE IF NOT EXISTS enrollments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_enrollment (user_id, course_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الاختبارات
        `CREATE TABLE IF NOT EXISTS exams (
            id INT AUTO_INCREMENT PRIMARY KEY,
            course_id INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            duration_minutes INT DEFAULT 30,
            pass_score INT DEFAULT 50,
            FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول الأسئلة
        `CREATE TABLE IF NOT EXISTS questions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            exam_id INT NOT NULL,
            question_text TEXT NOT NULL,
            option_a VARCHAR(500) NOT NULL,
            option_b VARCHAR(500) NOT NULL,
            option_c VARCHAR(500),
            option_d VARCHAR(500),
            correct_answer CHAR(1) NOT NULL,
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

        // جدول نتائج الاختبارات
        `CREATE TABLE IF NOT EXISTS exam_results (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            exam_id INT NOT NULL,
            score INT NOT NULL,
            total INT NOT NULL,
            taken_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ];

    let index = 0;
    function runNext() {
        if (index >= queries.length) {
            console.log('✅ تم التحقق من وجود جميع الجداول');
            migrateColumns(() => {
                seedDefaultData();
            });
            return;
        }
        db.query(queries[index], (err) => {
            if (err) {
                console.error(`❌ خطأ في إنشاء الجدول رقم ${index + 1}:`, err.message);
            }
            index++;
            runNext();
        });
    }
    runNext();
}

// دالة فحص وترقية الأعمدة المفقودة في قاعدة البيانات لضمان التوافق التام
function migrateColumns(callback) {
    const columnsToEnsure = [
        { table: 'users', column: 'phone', def: 'VARCHAR(20) NULL' },
        { table: 'users', column: 'avatar', def: 'VARCHAR(255) NULL' },
        { table: 'users', column: 'created_at', def: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
        { table: 'courses', column: 'section_id', def: 'INT NULL' },
        { table: 'courses', column: 'thumbnail', def: 'VARCHAR(255) NULL' },
        { table: 'courses', column: 'order_num', def: 'INT DEFAULT 0' }
    ];

    let cIndex = 0;
    function checkNext() {
        if (cIndex >= columnsToEnsure.length) {
            console.log('✅ تم التحقق من سلامة أعمدة قاعدة البيانات وتحديثها بنجاح');
            if (callback) callback();
            return;
        }
        const item = columnsToEnsure[cIndex];
        db.query(
            "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'qudurat_db' AND TABLE_NAME = ? AND COLUMN_NAME = ?",
            [item.table, item.column],
            (err, rows) => {
                if (!err && rows && rows[0].count === 0) {
                    db.query(`ALTER TABLE ${item.table} ADD COLUMN ${item.column} ${item.def}`, (alterErr) => {
                        if (alterErr) {
                            console.warn(`تنبيه أثناء إضافة العمود ${item.column}:`, alterErr.message);
                        } else {
                            console.log(`🔧 تم إضافة العمود المفقود ${item.column} إلى جدول ${item.table} بنجاح`);
                        }
                        cIndex++;
                        checkNext();
                    });
                } else {
                    cIndex++;
                    checkNext();
                }
            }
        );
    }
    checkNext();
}

// ============================================================
// دالة seedDefaultData — إنشاء البيانات الافتراضية
// ============================================================
function seedDefaultData() {
    // تحقق من وجود الأدمن
    db.query('SELECT id FROM users WHERE email = ?', ['hassan@elmajd.com'], (err, rows) => {
        if (err) { console.error('خطأ في seed users:', err.message); return; }
        if (rows.length === 0) {
            const hashed = bcrypt.hashSync('admin123', 10);
            db.query(
                'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                ['أستاذ حسن أبو الحمد', 'hassan@elmajd.com', hashed, 'admin'],
                (err2) => {
                    if (err2) console.error('خطأ في إنشاء الأدمن:', err2.message);
                    else console.log('✅ تم إنشاء حساب الأدمن الافتراضي (hassan@elmajd.com)');
                }
            );
        }
    });

    // إنشاء حساب طالب تجريبي افتراضي
    db.query('SELECT id FROM users WHERE email = ?', ['student@elmajd.com'], (err, rows) => {
        if (!err && rows.length === 0) {
            const hashedStudent = bcrypt.hashSync('student123', 10);
            db.query(
                'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
                ['طالب تجريبي', 'student@elmajd.com', hashedStudent, '0512345678', 'student'],
                (err2) => {
                    if (!err2) console.log('✅ تم إنشاء حساب الطالب الافتراضي (student@elmajd.com / student123)');
                }
            );
        }
    });

    // تحقق من وجود الأقسام
    db.query('SELECT id FROM sections', (err, rows) => {
        if (err) { console.error('خطأ في seed sections:', err.message); return; }
        if (rows.length === 0) {
            const sections = [
                ['الكمي المحوسب', '🔢', 1],
                ['اللفظي والاستيعاب', '📖', 2]
            ];
            sections.forEach(([title, icon, order_num]) => {
                db.query(
                    'INSERT INTO sections (title, icon, order_num) VALUES (?, ?, ?)',
                    [title, icon, order_num],
                    (err2) => {
                        if (err2) console.error('خطأ في إنشاء القسم:', err2.message);
                        else console.log(`✅ تم إنشاء قسم: ${title}`);
                    }
                );
            });
        }
    });
}

// ============================================================
// ====================== API Routes ==========================
// ============================================================

// -----------------------------------------------------------
// المصادقة (Authentication)
// -----------------------------------------------------------

// POST /api/login — تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (rows.length === 0) return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        const user = rows[0];
        const match = bcrypt.compareSync(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: 'بيانات الدخول غير صحيحة' });
        
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        req.session.save((saveErr) => {
            if (saveErr) return res.status(500).json({ success: false, message: 'خطأ في حفظ الجلسة' });
            res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
        });
    });
});

// POST /api/telegram-login — تسجيل دخول سريع عبر تليجرام
app.post('/api/telegram-login', (req, res) => {
    const telegramEmail = 'telegram_student@elmajd.com';
    const telegramName = 'طالب تليجرام المتميز';

    db.query('SELECT * FROM users WHERE email = ?', [telegramEmail], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });

        if (rows.length > 0) {
            const user = rows[0];
            req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
            req.session.save((saveErr) => {
                if (saveErr) return res.status(500).json({ success: false, message: 'خطأ في حفظ الجلسة' });
                res.json({ success: true, user: { id: user.id, name: user.name, role: user.role } });
            });
        } else {
            const hashed = bcrypt.hashSync('telegram123', 10);
            db.query(
                'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
                [telegramName, telegramEmail, hashed, '0500000000', 'student'],
                (err2, result) => {
                    if (err2) return res.status(500).json({ success: false, message: 'خطأ في إنشاء الحساب' });
                    req.session.user = { id: result.insertId, name: telegramName, email: telegramEmail, role: 'student' };
                    req.session.save((saveErr) => {
                        if (saveErr) return res.status(500).json({ success: false, message: 'خطأ في حفظ الجلسة' });
                        res.json({ success: true, user: { id: result.insertId, name: telegramName, role: 'student' } });
                    });
                }
            );
        }
    });
});

// POST /api/logout — تسجيل الخروج
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في تسجيل الخروج' });
        res.json({ success: true });
    });
});

// POST /api/register — تسجيل طالب جديد
app.post('/api/register', (req, res) => {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    db.query('SELECT id FROM users WHERE email = ?', [cleanEmail], (err, rows) => {
        if (err) {
            console.error('خطأ فحص البريد في DB:', err.message);
            return res.status(500).json({ success: false, message: 'خطأ في الاتصال بقاعدة البيانات' });
        }
        if (rows.length > 0) {
            return res.status(409).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً! يرجى تسجيل الدخول' });
        }
        const hashed = bcrypt.hashSync(password, 10);
        
        db.query(
            'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
            [cleanName, cleanEmail, hashed, phone ? phone.trim() : null, 'student'],
            (err2, result) => {
                if (err2) {
                    console.warn('⚠️ تنبيه أثناء الإدخال مع الهاتف، تجربة الإدخال بدون هاتف:', err2.message);
                    // محاولة بديلة في حال كان عمود الهاتف غير متاح
                    db.query(
                        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
                        [cleanName, cleanEmail, hashed, 'student'],
                        (fallbackErr, fallbackResult) => {
                            if (fallbackErr) {
                                console.error('❌ خطأ إنشاء الحساب في MySQL:', fallbackErr.message);
                                return res.status(500).json({ success: false, message: 'تعذر حفظ الحساب في قاعدة البيانات: ' + fallbackErr.message });
                            }
                            req.session.user = { id: fallbackResult.insertId, name: cleanName, email: cleanEmail, role: 'student' };
                            req.session.save(() => {
                                res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح', user: req.session.user });
                            });
                        }
                    );
                    return;
                }
                req.session.user = { id: result.insertId, name: cleanName, email: cleanEmail, role: 'student' };
                req.session.save(() => {
                    res.status(201).json({ success: true, message: 'تم إنشاء الحساب بنجاح', user: req.session.user });
                });
            }
        );
    });
});

// GET /api/me — بيانات المستخدم الحالي
app.get('/api/me', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query('SELECT id, name, email, phone, role, avatar, created_at FROM users WHERE id = ?', [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        const userObj = rows[0];
        // تحديث الرتبة والبيانات في الجلسة لمطابقة قاعدة البيانات فوراً
        req.session.user.role = userObj.role;
        req.session.user.name = userObj.name;
        req.session.user.email = userObj.email;
        req.session.save(() => {
            res.json({ success: true, user: userObj, role: userObj.role, name: userObj.name, email: userObj.email });
        });
    });
});

// -----------------------------------------------------------
// الأقسام (Sections)
// -----------------------------------------------------------

// GET /api/sections — كل الأقسام
app.get('/api/sections', (req, res) => {
    const sql = `
        SELECT s.*, (SELECT COUNT(*) FROM courses WHERE section_id = s.id) AS courses_count
        FROM sections s
        ORDER BY s.order_num ASC, s.id ASC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, sections: rows });
    });
});

// POST /api/sections — أضف قسم جديد
app.post('/api/sections', requireAdmin, (req, res) => {
    const { title, icon, order_num } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'عنوان القسم مطلوب' });
    db.query(
        'INSERT INTO sections (title, icon, order_num) VALUES (?, ?, ?)',
        [title, icon || '📚', order_num || 0],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة القسم' });
            res.status(201).json({ success: true, message: 'تم إضافة القسم', id: result.insertId });
        }
    );
});

// PUT /api/sections/:id — تعديل قسم
app.put('/api/sections/:id', requireAdmin, (req, res) => {
    const { title, icon, order_num } = req.body;
    const { id } = req.params;
    db.query(
        'UPDATE sections SET title = COALESCE(?, title), icon = COALESCE(?, icon), order_num = COALESCE(?, order_num) WHERE id = ?',
        [title || null, icon || null, order_num !== undefined ? order_num : null, id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في تعديل القسم' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'القسم غير موجود' });
            res.json({ success: true, message: 'تم تعديل القسم' });
        }
    );
});

// DELETE /api/sections/:id — حذف قسم
app.delete('/api/sections/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM sections WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف القسم' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'القسم غير موجود' });
        res.json({ success: true, message: 'تم حذف القسم' });
    });
});

// -----------------------------------------------------------
// الدورات (Courses)
// -----------------------------------------------------------

// GET /api/courses — كل الدورات مع اسم القسم وعدد الطلاب والدروس
app.get('/api/courses', (req, res) => {
    const { section_id } = req.query;
    let sql = `
        SELECT c.*, s.title AS section_title, s.icon AS section_icon,
               (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) AS students_count,
               (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS lessons_count
        FROM courses c
        LEFT JOIN sections s ON c.section_id = s.id
    `;
    const params = [];
    if (section_id) {
        sql += ' WHERE c.section_id = ?';
        params.push(section_id);
    }
    sql += ' ORDER BY c.order_num ASC, c.id ASC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        const courses = rows.map(r => ({
            ...r,
            section: { id: r.section_id, title: r.section_title, icon: r.section_icon }
        }));
        res.json({ success: true, courses });
    });
});

// GET /api/courses/:id — دورة واحدة مع تفاصيلها
app.get('/api/courses/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT c.*, s.title AS section_title, s.icon AS section_icon,
               (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) AS students_count,
               (SELECT COUNT(*) FROM lessons WHERE course_id = c.id) AS lessons_count
        FROM courses c
        LEFT JOIN sections s ON c.section_id = s.id
        WHERE c.id = ?
    `;
    db.query(sql, [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'الدورة غير موجودة' });
        const course = rows[0];
        course.section = { id: course.section_id, title: course.section_title, icon: course.section_icon };
        res.json({ success: true, course });
    });
});

// POST /api/courses — أضف دورة مع thumbnail
app.post('/api/courses', requireAdmin, uploadImage.single('thumbnail'), (req, res) => {
    const { section_id, title, description, price, order_num } = req.body;
    if (!title) return res.status(400).json({ success: false, message: 'عنوان الدورة مطلوب' });
    const thumbnail = req.file ? `/uploads/images/${req.file.filename}` : null;
    db.query(
        'INSERT INTO courses (section_id, title, description, price, thumbnail, order_num) VALUES (?, ?, ?, ?, ?, ?)',
        [section_id || null, title, description || null, price || 0, thumbnail, order_num || 0],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة الدورة' });
            res.status(201).json({ success: true, message: 'تم إضافة الدورة', id: result.insertId });
        }
    );
});

// PUT /api/courses/:id — تعديل دورة
app.put('/api/courses/:id', requireAdmin, uploadImage.single('thumbnail'), (req, res) => {
    const { id } = req.params;
    const { section_id, title, description, price, order_num } = req.body;
    const updateThumbnail = req.file ? `/uploads/images/${req.file.filename}` : null;

    let sql, params;
    if (updateThumbnail) {
        sql    = 'UPDATE courses SET section_id=?, title=?, description=?, price=?, thumbnail=?, order_num=? WHERE id=?';
        params = [section_id || null, title, description || null, price || 0, updateThumbnail, order_num || 0, id];
    } else {
        sql    = 'UPDATE courses SET section_id=?, title=?, description=?, price=?, order_num=? WHERE id=?';
        params = [section_id || null, title, description || null, price || 0, order_num || 0, id];
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في تعديل الدورة' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الدورة غير موجودة' });
        res.json({ success: true, message: 'تم تعديل الدورة' });
    });
});

// DELETE /api/courses/:id — حذف دورة
app.delete('/api/courses/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM courses WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف الدورة' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الدورة غير موجودة' });
        res.json({ success: true, message: 'تم حذف الدورة' });
    });
});

// -----------------------------------------------------------
// الدروس (Lessons)
// -----------------------------------------------------------

// GET /api/courses/:id/lessons — دروس دورة معينة مع ملفات الـ PDF
app.get('/api/courses/:id/lessons', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT l.*, p.id AS pdf_id, p.filename AS pdf_filename, p.original_path AS pdf_url
        FROM lessons l
        LEFT JOIN pdfs p ON p.lesson_id = l.id
        WHERE l.course_id = ?
        ORDER BY l.order_num ASC, l.id ASC
    `;
    db.query(sql, [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        const lessons = rows.map(r => ({
            ...r,
            pdf: r.pdf_id ? { id: r.pdf_id, filename: r.pdf_filename, original_path: r.pdf_url } : null
        }));
        res.json({ success: true, lessons });
    });
});

// POST /api/courses/:id/lessons — إضافة درس لدورة مباشرة
app.post('/api/courses/:id/lessons', requireAdmin, uploadPdf.single('pdf'), (req, res) => {
    req.body.course_id = req.params.id;
    const { course_id, title, video_url, content, order_num } = req.body;
    if (!title) {
        return res.status(400).json({ success: false, message: 'العنوان مطلوب' });
    }
    db.query(
        'INSERT INTO lessons (course_id, title, video_url, content, order_num) VALUES (?, ?, ?, ?, ?)',
        [course_id, title, video_url || null, content || null, order_num || 0],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة الدرس' });
            const lessonId = result.insertId;
            if (req.file) {
                const filename = req.file.filename;
                const filePath = `/uploads/pdfs/${filename}`;
                db.query(
                    'INSERT INTO pdfs (lesson_id, filename, original_path) VALUES (?, ?, ?)',
                    [lessonId, filename, filePath],
                    (err2) => {
                        if (err2) console.error('خطأ في حفظ PDF:', err2.message);
                    }
                );
            }
            res.status(201).json({ success: true, message: 'تم إضافة الدرس', id: lessonId });
        }
    );
});

// GET /api/lessons?course_id=X — دروس دورة معينة
app.get('/api/lessons', (req, res) => {
    const { course_id } = req.query;
    if (!course_id) return res.status(400).json({ success: false, message: 'course_id مطلوب' });
    const sql = `
        SELECT l.*, p.id AS pdf_id, p.filename AS pdf_filename, p.original_path AS pdf_url
        FROM lessons l
        LEFT JOIN pdfs p ON p.lesson_id = l.id
        WHERE l.course_id = ?
        ORDER BY l.order_num ASC, l.id ASC
    `;
    db.query(sql, [course_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        const lessons = rows.map(r => ({
            ...r,
            pdf: r.pdf_id ? { id: r.pdf_id, filename: r.pdf_filename, original_path: r.pdf_url } : null
        }));
        res.json({ success: true, lessons });
    });
});

// GET /api/lessons/:id — درس واحد مع الـ PDF المرفق به واسم الدورة
app.get('/api/lessons/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT l.*, c.title AS course_title
        FROM lessons l
        LEFT JOIN courses c ON l.course_id = c.id
        WHERE l.id = ?
    `;
    db.query(sql, [id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'الدرس غير موجود' });
        const lesson = rows[0];
        db.query('SELECT * FROM pdfs WHERE lesson_id = ?', [id], (err2, pdfs) => {
            if (err2) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            lesson.pdfs = pdfs || [];
            lesson.pdf = (pdfs && pdfs.length > 0) ? pdfs[0] : null;
            if (lesson.pdf) {
                lesson.pdf_url = lesson.pdf.original_path;
            }
            res.json({ success: true, lesson });
        });
    });
});

// POST /api/lessons — أضف درس مع رفع PDF
app.post('/api/lessons', requireAdmin, uploadPdf.single('pdf'), (req, res) => {
    const { course_id, title, video_url, content, order_num } = req.body;
    if (!course_id || !title) {
        return res.status(400).json({ success: false, message: 'course_id والعنوان مطلوبان' });
    }
    db.query(
        'INSERT INTO lessons (course_id, title, video_url, content, order_num) VALUES (?, ?, ?, ?, ?)',
        [course_id, title, video_url || null, content || null, order_num || 0],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة الدرس' });
            const lessonId = result.insertId;
            if (req.file) {
                const filename = req.file.filename;
                const filePath = `/uploads/pdfs/${filename}`;
                db.query(
                    'INSERT INTO pdfs (lesson_id, filename, original_path) VALUES (?, ?, ?)',
                    [lessonId, filename, filePath],
                    (err2) => {
                        if (err2) console.error('خطأ في حفظ PDF:', err2.message);
                    }
                );
            }
            res.status(201).json({ success: true, message: 'تم إضافة الدرس', id: lessonId });
        }
    );
});

// PUT /api/lessons/:id — تعديل درس
app.put('/api/lessons/:id', requireAdmin, uploadPdf.single('pdf'), (req, res) => {
    const { id } = req.params;
    const { title, video_url, content, order_num } = req.body;
    db.query(
        'UPDATE lessons SET title=?, video_url=?, content=?, order_num=? WHERE id=?',
        [title, video_url || null, content || null, order_num || 0, id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في تعديل الدرس' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الدرس غير موجود' });
            if (req.file) {
                const filename = req.file.filename;
                const filePath = `/uploads/pdfs/${filename}`;
                db.query(
                    'INSERT INTO pdfs (lesson_id, filename, original_path) VALUES (?, ?, ?)',
                    [id, filename, filePath],
                    (err2) => {
                        if (err2) console.error('خطأ في حفظ PDF:', err2.message);
                    }
                );
            }
            res.json({ success: true, message: 'تم تعديل الدرس' });
        }
    );
});

// DELETE /api/lessons/:id — حذف درس
app.delete('/api/lessons/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM lessons WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف الدرس' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الدرس غير موجود' });
        res.json({ success: true, message: 'تم حذف الدرس' });
    });
});

// -----------------------------------------------------------
// الاشتراكات (Enrollments)
// -----------------------------------------------------------

// GET /api/enrollments/me — دورات الطالب المسجل
app.get('/api/enrollments/me', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT e.id AS enrollment_id, e.enrolled_at, c.id, c.id AS course_id,
               c.title, c.description, c.price, c.thumbnail, s.title AS section_title
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        LEFT JOIN sections s ON c.section_id = s.id
        WHERE e.user_id = ?
        ORDER BY e.enrolled_at DESC
    `;
    db.query(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, enrollments: rows, courses: rows });
    });
});

// GET /api/enrollments — اشتراكات الطلاب (أدمن - يدعم التصفية بدورة أو طالب)
app.get('/api/enrollments', requireAdmin, (req, res) => {
    const { course_id, user_id } = req.query;
    let sql = `
        SELECT e.id AS enrollment_id, e.enrolled_at,
               u.id AS user_id, u.id AS id, u.name, u.email, u.phone,
               c.id AS course_id, c.title AS course_title
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        JOIN courses c ON e.course_id = c.id
    `;
    const params = [];
    const conditions = [];
    if (course_id) {
        conditions.push('e.course_id = ?');
        params.push(course_id);
    }
    if (user_id) {
        conditions.push('e.user_id = ?');
        params.push(user_id);
    }
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY e.enrolled_at DESC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, enrollments: rows, students: rows });
    });
});

// GET /api/courses/:id/students — طلاب دورة معينة
app.get('/api/courses/:id/students', requireAdmin, (req, res) => {
    const courseId = req.params.id;
    const sql = `
        SELECT u.id, u.name, u.email, u.phone, e.id AS enrollment_id, e.enrolled_at
        FROM enrollments e
        JOIN users u ON e.user_id = u.id
        WHERE e.course_id = ?
        ORDER BY e.enrolled_at DESC
    `;
    db.query(sql, [courseId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, students: rows, data: rows });
    });
});

// POST /api/courses/:id/students — إضافة طالب لدورة
app.post('/api/courses/:id/students', requireAdmin, (req, res) => {
    const courseId = req.params.id;
    const studentId = req.body.student_id || req.body.user_id;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'student_id مطلوب' });
    }
    db.query(
        'INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)',
        [studentId, courseId],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success: false, message: 'الطالب مشترك في هذه الدورة بالفعل' });
                }
                return res.status(500).json({ success: false, message: 'خطأ في تسجيل الطالب' });
            }
            res.status(201).json({ success: true, message: 'تم تسجيل الطالب في الدورة بنجاح', enrollment_id: result.insertId });
        }
    );
});

// DELETE /api/courses/:id/students/:student_id — إزالة طالب من دورة
app.delete('/api/courses/:id/students/:student_id', requireAdmin, (req, res) => {
    const { id, student_id } = req.params;
    db.query(
        'DELETE FROM enrollments WHERE course_id = ? AND user_id = ?',
        [id, student_id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إزالة الطالب' });
            res.json({ success: true, message: 'تمت إزالة الطالب من الدورة' });
        }
    );
});

// GET /api/students-not-enrolled/:course_id — طلاب غير مشتركين في دورة
app.get('/api/students-not-enrolled/:course_id', requireAdmin, (req, res) => {
    const { course_id } = req.params;
    const sql = `
        SELECT u.id, u.name, u.email, u.phone
        FROM users u
        WHERE u.role = 'student'
          AND u.id NOT IN (
              SELECT user_id FROM enrollments WHERE course_id = ?
          )
        ORDER BY u.name ASC
    `;
    db.query(sql, [course_id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, students: rows });
    });
});

// POST /api/enrollments — اشترك طالب في دورة
app.post('/api/enrollments', requireAdmin, (req, res) => {
    const { user_id, course_id } = req.body;
    if (!user_id || !course_id) {
        return res.status(400).json({ success: false, message: 'user_id و course_id مطلوبان' });
    }
    db.query(
        'INSERT INTO enrollments (user_id, course_id) VALUES (?, ?)',
        [user_id, course_id],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ success: false, message: 'الطالب مشترك في هذه الدورة بالفعل' });
                }
                return res.status(500).json({ success: false, message: 'خطأ في الاشتراك' });
            }
            res.status(201).json({ success: true, message: 'تم الاشتراك بنجاح', id: result.insertId });
        }
    );
});

// DELETE /api/enrollments/:id — احذف اشتراك
app.delete('/api/enrollments/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM enrollments WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف الاشتراك' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الاشتراك غير موجود' });
        res.json({ success: true, message: 'تم حذف الاشتراك' });
    });
});

// -----------------------------------------------------------
// PDF الشخصي للطالب (Student PDFs)
// -----------------------------------------------------------

// GET /api/student-pdf/:pdf_id — يرجع URL للـ PDF الشخصي للطالب (أو الأصلي للزائر)
app.get('/api/student-pdf/:pdf_id', (req, res) => {
    const pdfId = req.params.pdf_id;

    // إذا لم يكن المستخدم مسجلاً، يرجع له ملف PDF الأصلي للاستعراض بحرية
    if (!req.session || !req.session.user) {
        db.query('SELECT * FROM pdfs WHERE id = ?', [pdfId], (err, pdfRows) => {
            if (err || pdfRows.length === 0) return res.status(404).json({ success: false, message: 'الملف غير موجود' });
            return res.json({ success: true, url: pdfRows[0].original_path });
        });
        return;
    }

    const userId = req.session.user.id;

    // ابحث عن نسخة شخصية موجودة
    db.query(
        'SELECT * FROM student_pdfs WHERE user_id = ? AND pdf_id = ?',
        [userId, pdfId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });

            if (rows.length > 0) {
                // النسخة الشخصية موجودة — ارجع URL
                const filename = path.basename(rows[0].personal_path);
                return res.json({ success: true, url: `/uploads/student-pdfs/${filename}` });
            }

            // لا توجد نسخة شخصية — ابحث عن الأصل وانسخه
            db.query('SELECT * FROM pdfs WHERE id = ?', [pdfId], (err2, pdfRows) => {
                if (err2) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
                if (pdfRows.length === 0) return res.status(404).json({ success: false, message: 'الملف غير موجود' });

                const originalPdf    = pdfRows[0];
                const originalAbsPath = path.join(__dirname, originalPdf.original_path.replace(/^\//, ''));

                if (!fs.existsSync(originalAbsPath)) {
                    return res.status(404).json({ success: false, message: 'ملف PDF الأصلي غير موجود على السيرفر' });
                }

                // إنشاء اسم ملف جديد للنسخة الشخصية
                const newFilename = `${userId}_${pdfId}_${uuidv4()}.pdf`;
                const newAbsPath  = path.join(__dirname, 'uploads', 'student-pdfs', newFilename);
                const newRelPath  = `/uploads/student-pdfs/${newFilename}`;

                try {
                    fs.copyFileSync(originalAbsPath, newAbsPath);
                } catch (copyErr) {
                    console.error('خطأ في نسخ الملف:', copyErr.message);
                    return res.status(500).json({ success: false, message: 'خطأ في نسخ الملف' });
                }

                // حفظ السجل في قاعدة البيانات
                db.query(
                    'INSERT INTO student_pdfs (user_id, pdf_id, personal_path) VALUES (?, ?, ?)',
                    [userId, pdfId, newRelPath],
                    (err3) => {
                        if (err3) {
                            console.error('خطأ في حفظ student_pdf:', err3.message);
                            return res.status(500).json({ success: false, message: 'خطأ في إنشاء النسخة الشخصية' });
                        }
                        res.json({ success: true, url: newRelPath });
                    }
                );
            });
        }
    );
});

// GET /api/student-pdf/:pdf_id/download — تنزيل النسخة الشخصية
app.get('/api/student-pdf/:pdf_id/download', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const pdfId  = req.params.pdf_id;

    db.query(
        'SELECT * FROM student_pdfs WHERE user_id = ? AND pdf_id = ?',
        [userId, pdfId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            if (rows.length === 0) {
                return res.status(404).json({ success: false, message: 'لا توجد نسخة شخصية بعد، قم بفتح الملف أولاً' });
            }

            const absPath = path.join(__dirname, rows[0].personal_path.replace(/^\//, ''));
            if (!fs.existsSync(absPath)) {
                return res.status(404).json({ success: false, message: 'الملف غير موجود على السيرفر' });
            }

            res.download(absPath, `student_${userId}_pdf_${pdfId}.pdf`, (dlErr) => {
                if (dlErr) console.error('خطأ في التنزيل:', dlErr.message);
            });
        }
    );
});

// -----------------------------------------------------------
// الاختبارات (Exams)
// -----------------------------------------------------------

// GET /api/courses/:id/exams — اختبارات دورة معينة
app.get('/api/courses/:id/exams', (req, res) => {
    const { id } = req.params;
    db.query(
        'SELECT id, course_id, title, duration_minutes, pass_score FROM exams WHERE course_id = ? ORDER BY id ASC',
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            res.json({ success: true, exams: rows });
        }
    );
});

// GET /api/exams — اختبارات دورة أو كل الاختبارات
app.get('/api/exams', (req, res) => {
    const { course_id } = req.query;
    let sql = `
        SELECT e.id, e.course_id, e.title, e.duration_minutes, e.pass_score, c.title AS course_title
        FROM exams e
        LEFT JOIN courses c ON e.course_id = c.id
    `;
    const params = [];
    if (course_id) {
        sql += ' WHERE e.course_id = ?';
        params.push(course_id);
    }
    sql += ' ORDER BY e.id ASC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, exams: rows });
    });
});

// GET /api/exams/:id — اختبار كامل مع الإجابات (أدمن فقط)
app.get('/api/exams/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM exams WHERE id = ?', [id], (err, examRows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (examRows.length === 0) return res.status(404).json({ success: false, message: 'الاختبار غير موجود' });
        const exam = examRows[0];
        db.query('SELECT * FROM questions WHERE exam_id = ? ORDER BY id ASC', [id], (err2, questions) => {
            if (err2) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            exam.questions = questions || [];
            res.json({ success: true, exam, questions: exam.questions });
        });
    });
});

// GET /api/exams/:id/take — اختبار للطالب (بدون إجابات صحيحة)
app.get('/api/exams/:id/take', requireLogin, (req, res) => {
    const { id } = req.params;
    db.query(
        'SELECT id, course_id, title, duration_minutes, pass_score FROM exams WHERE id = ?',
        [id],
        (err, examRows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            if (examRows.length === 0) return res.status(404).json({ success: false, message: 'الاختبار غير موجود' });
            const exam = examRows[0];
            // لا نرجع correct_answer للطالب
            db.query(
                'SELECT id, question_text, option_a, option_b, option_c, option_d FROM questions WHERE exam_id = ? ORDER BY id ASC',
                [id],
                (err2, questions) => {
                    if (err2) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
                    exam.questions = questions || [];
                    res.json({ success: true, exam, questions: exam.questions });
                }
            );
        }
    );
});

// POST /api/exams — أضف اختبار
app.post('/api/exams', requireAdmin, (req, res) => {
    const { course_id, title, duration_minutes, pass_score } = req.body;
    if (!course_id || !title) {
        return res.status(400).json({ success: false, message: 'course_id والعنوان مطلوبان' });
    }
    db.query(
        'INSERT INTO exams (course_id, title, duration_minutes, pass_score) VALUES (?, ?, ?, ?)',
        [course_id, title, duration_minutes || 30, pass_score || 50],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة الاختبار' });
            res.status(201).json({ success: true, message: 'تم إضافة الاختبار', id: result.insertId });
        }
    );
});

// PUT /api/exams/:id — تعديل اختبار
app.put('/api/exams/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { title, duration_minutes, pass_score } = req.body;
    db.query(
        'UPDATE exams SET title=?, duration_minutes=?, pass_score=? WHERE id=?',
        [title, duration_minutes || 30, pass_score || 50, id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في تعديل الاختبار' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الاختبار غير موجود' });
            res.json({ success: true, message: 'تم تعديل الاختبار' });
        }
    );
});

// DELETE /api/exams/:id — حذف اختبار
app.delete('/api/exams/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM exams WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف الاختبار' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'الاختبار غير موجود' });
        res.json({ success: true, message: 'تم حذف الاختبار' });
    });
});

// -----------------------------------------------------------
// الأسئلة (Questions)
// -----------------------------------------------------------

// POST /api/questions — أضف سؤال
app.post('/api/questions', requireAdmin, (req, res) => {
    const { exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer } = req.body;
    if (!exam_id || !question_text || !option_a || !option_b || !correct_answer) {
        return res.status(400).json({ success: false, message: 'البيانات الأساسية للسؤال مطلوبة' });
    }
    db.query(
        'INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_answer) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [exam_id, question_text, option_a, option_b, option_c || null, option_d || null, correct_answer.toUpperCase()],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في إضافة السؤال' });
            res.status(201).json({ success: true, message: 'تم إضافة السؤال', id: result.insertId });
        }
    );
});

// DELETE /api/questions/:id — حذف سؤال
app.delete('/api/questions/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM questions WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف السؤال' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'السؤال غير موجود' });
        res.json({ success: true, message: 'تم حذف السؤال' });
    });
});

// POST /api/exams/:id/submit — تسليم الاختبار وحساب النتيجة
app.post('/api/exams/:id/submit', requireLogin, (req, res) => {
    const examId = req.params.id;
    const userId = req.session.user.id;
    const { answers } = req.body; // { question_id: 'A', ... }

    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ success: false, message: 'الإجابات مطلوبة' });
    }

    // جلب معلومات الاختبار
    db.query('SELECT * FROM exams WHERE id = ?', [examId], (err, examRows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (examRows.length === 0) return res.status(404).json({ success: false, message: 'الاختبار غير موجود' });
        const exam = examRows[0];

        // جلب الأسئلة مع الإجابات الصحيحة
        db.query('SELECT * FROM questions WHERE exam_id = ?', [examId], (err2, questions) => {
            if (err2) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });

            let score   = 0;
            const total = questions.length;

            questions.forEach((q) => {
                const studentAnswer = answers[q.id];
                if (studentAnswer && studentAnswer.toUpperCase() === q.correct_answer.toUpperCase()) {
                    score++;
                }
            });

            // حساب النسبة المئوية بدقة ومقارنتها بنسبة النجاح
            const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
            const passed = percentage >= (exam.pass_score || 50);

            // حفظ النتيجة
            db.query(
                'INSERT INTO exam_results (user_id, exam_id, score, total) VALUES (?, ?, ?, ?)',
                [userId, examId, score, total],
                (err3, result) => {
                    if (err3) return res.status(500).json({ success: false, message: 'خطأ في حفظ النتيجة' });
                    res.json({
                        success: true,
                        score,
                        total,
                        percentage,
                        passed,
                        resultId: result.insertId
                    });
                }
            );
        });
    });
});

// -----------------------------------------------------------
// نتائج الاختبارات (Exam Results)
// -----------------------------------------------------------

// GET /api/results/me — نتائج الطالب الحالي
app.get('/api/results/me', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT er.id, er.score, er.total, er.taken_at,
               e.title AS exam_title, e.pass_score, c.title AS course_title
        FROM exam_results er
        JOIN exams e ON er.exam_id = e.id
        JOIN courses c ON e.course_id = c.id
        WHERE er.user_id = ?
        ORDER BY er.taken_at DESC
    `;
    db.query(sql, [userId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, results: rows });
    });
});

// GET /api/results — نتائج الاختبارات (أدمن - يدعم التصفية بطالب معين أو كل النتائج)
app.get('/api/results', requireAdmin, (req, res) => {
    const { user_id } = req.query;
    let sql = `
        SELECT er.id, er.score, er.total, er.taken_at,
               u.name AS user_name, u.email AS user_email,
               e.title AS exam_title, e.pass_score, c.title AS course_title
        FROM exam_results er
        JOIN users u ON er.user_id = u.id
        JOIN exams e ON er.exam_id = e.id
        JOIN courses c ON e.course_id = c.id
    `;
    const params = [];
    if (user_id) {
        sql += ' WHERE er.user_id = ?';
        params.push(user_id);
    }
    sql += ' ORDER BY er.taken_at DESC';

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        res.json({ success: true, results: rows });
    });
});

// -----------------------------------------------------------
// إدارة المستخدمين (Users)
// -----------------------------------------------------------

// GET /api/users — كل المستخدمين (أدمن)
app.get('/api/users', requireAdmin, (req, res) => {
    db.query(
        'SELECT id, name, email, phone, role, avatar, created_at FROM users ORDER BY created_at DESC',
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            res.json({ success: true, users: rows });
        }
    );
});

// GET /api/users/students — الطلاب فقط (أدمن)
app.get('/api/users/students', requireAdmin, (req, res) => {
    db.query(
        "SELECT id, name, email, phone, avatar, created_at FROM users WHERE role = 'student' ORDER BY name ASC",
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            res.json({ success: true, students: rows });
        }
    );
});

// PUT /api/users/me — تحديث بيانات الطالب نفسه
app.put('/api/users/me', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const { name, phone, email } = req.body;
    if (!name && !phone && !email) {
        return res.status(400).json({ success: false, message: 'لا توجد بيانات للتحديث' });
    }
    const checkEmail = email ? email : req.session.user.email;
    db.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [checkEmail, userId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
            if (rows.length > 0) return res.status(409).json({ success: false, message: 'البريد الإلكتروني مستخدم بالفعل' });
            db.query(
                'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?',
                [name || null, phone || null, email || null, userId],
                (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: 'خطأ في التحديث' });
                    if (name)  req.session.user.name  = name;
                    if (email) req.session.user.email = email;
                    res.json({ success: true, message: 'تم تحديث البيانات' });
                }
            );
        }
    );
});

// PUT /api/admin/users/:id — تحديث بيانات أي مستخدم (أدمن)
app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    const { name, phone, email, role, password } = req.body;
    let sql = 'UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email), role = COALESCE(?, role)';
    const params = [name || null, phone || null, email || null, role || null];
    if (password && password.trim() !== '') {
        sql += ', password = ?';
        params.push(bcrypt.hashSync(password, 10));
    }
    sql += ' WHERE id = ?';
    params.push(id);

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في تعديل المستخدم' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        res.json({ success: true, message: 'تم تعديل بيانات المستخدم' });
    });
});

// DELETE /api/admin/users/:id — حذف مستخدم (أدمن)
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    if (req.session && req.session.user && req.session.user.id == id) {
        return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الحالي' });
    }
    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف المستخدم' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    });
});
app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    if (req.session && req.session.user && req.session.user.id == id) {
        return res.status(400).json({ success: false, message: 'لا يمكنك حذف حسابك الحالي' });
    }
    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في حذف المستخدم' });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        res.json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    });
});

// POST /api/admin/users — إضافة مستخدم جديد (أدمن)
app.post('/api/admin/users', requireAdmin, (req, res) => {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'الاسم والبريد وكلمة المرور مطلوبة' });
    }
    db.query('SELECT id FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'خطأ في الخادم' });
        if (rows.length > 0) return res.status(409).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً' });
        const hashed = bcrypt.hashSync(password, 10);
        db.query(
            'INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)',
            [name, email, hashed, phone || null, role || 'student'],
            (err2, result) => {
                if (err2) return res.status(500).json({ success: false, message: 'خطأ في إنشاء المستخدم' });
                res.status(201).json({ success: true, message: 'تم إنشاء المستخدم', id: result.insertId });
            }
        );
    });
});

// -----------------------------------------------------------
// إحصائيات الأدمن (Admin Stats)
// -----------------------------------------------------------

// GET /api/admin/stats — إحصائيات عامة
app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const statsQueries = {
        totalStudents : "SELECT COUNT(*) AS count FROM users WHERE role = 'student'",
        totalCourses  : 'SELECT COUNT(*) AS count FROM courses',
        totalSections : 'SELECT COUNT(*) AS count FROM sections',
        totalExams    : 'SELECT COUNT(*) AS count FROM exams'
    };

    const keys    = Object.keys(statsQueries);
    const results = {};
    let pending   = keys.length;

    keys.forEach((key) => {
        db.query(statsQueries[key], (err, rows) => {
            results[key] = (err) ? 0 : rows[0].count;
            pending--;
            if (pending === 0) {
                res.json({
                    success       : true,
                    totalStudents : results.totalStudents,
                    totalCourses  : results.totalCourses,
                    totalSections : results.totalSections,
                    totalExams    : results.totalExams
                });
            }
        });
    });
});

// ============================================================
// تشغيل السيرفر
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل على: http://localhost:${PORT}`);
});
