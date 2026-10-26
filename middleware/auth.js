// ============================================================
// middleware/auth.js
// Middleware للتحقق من تسجيل الدخول ومن دور المستخدم
// ============================================================

/**
 * requireLogin
 * يتحقق من أن المستخدم مسجل دخوله (session موجودة).
 * إذا لم تكن الجلسة موجودة يرجع 401 Unauthorized.
 */
function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'يجب تسجيل الدخول أولاً'
        });
    }
    next();
}

/**
 * requireAdmin
 * يتحقق من أن المستخدم مسجل دخوله وأن دوره هو "admin".
 * إذا لم يكن مسجلاً يرجع 401، وإذا لم يكن أدمن يرجع 403 Forbidden.
 */
function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            success: false,
            message: 'يجب تسجيل الدخول أولاً'
        });
    }
    if (req.session.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'ليس لديك صلاحية للوصول إلى هذا المورد'
        });
    }
    next();
}

module.exports = { requireLogin, requireAdmin };
