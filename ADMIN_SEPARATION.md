# Admin Database Separation

## Overview
الأدمن تم فصله إلى جدول منفصل بدلاً من تخزينه كمستخدم عادي. هذا يوفر فصل أنظف بين المستخدمين العاديين والمديرين.

## Changes Made

### 1. New Models
- **Admin.js**: نموذج منفصل للأدمن يحتوي على:
  - `fullName`, `email`, `password`, `avatar`
  - `createdTasks`: مصفوفة بمعرفات المهام التي أنشأها الأدمن
  - `isActive`, `timestamps`

### 2. Updated User Model
- إزالة حقل `role` 
- المستخدمون الآن يكونون دائماً "user" فقط

### 3. Updated Task Model
- تغيير `createdBy` من الإشارة إلى "User" إلى الإشارة إلى "Admin"
- `assignedTo` لا تزال تشير إلى "User" (المهام تُعطى للمستخدمين)

### 4. Authentication Updates
- **registerUser**: تسجيل مستخدم عادي فقط (بدون adminInviteToken)
- **registerAdmin**: دالة جديدة لتسجيل الأدمن (يتطلب adminInviteToken)
- **loginUser**: يتحقق من كلا الجداول (User و Admin)
- **getMe**: يسترجع البيانات من الجدول الصحيح حسب الدور

### 5. Auth Middleware Updates
- `protect`: يتعامل مع كلا الدورين (user و admin)
- يأخذ الدور من JWT token
- يسترجع البيانات من الجدول الصحيح

### 6. Task Controller Updates
- **createTask**: يضيف المهمة إلى مصفوفة `createdTasks` للأدمن
- **getAdminTasks**: يسترجع فقط المهام التي أنشأها الأدمن الحالي
- **getTaskStats**: يحسب الإحصائيات فقط للمهام التي أنشأها الأدمن
- **deleteTask**: يزيل المهمة من مصفوفة `createdTasks` عند حذفها

### 7. User Controller Updates
- **updateUser**: إزالة حقل `role`
- **getTeamStats**: إزالة فلتر `role: "user"`

### 8. Seed Script Updates
- ينشئ أدمن في جدول Admin
- ينشئ مستخدمين عاديين في جدول User
- يربط المهام بالأدمن من خلال `createdBy`

## New API Endpoints

### Admin Registration
```
POST /api/auth/admin/signup
Body: {
  fullName: string,
  email: string,
  password: string,
  adminInviteToken: string
}
```

### Regular User Registration
```
POST /api/auth/signup
Body: {
  fullName: string,
  email: string,
  password: string
}
```

### Login (works for both)
```
POST /api/auth/login
Body: {
  email: string,
  password: string
}
Returns: {
  token: JWT,
  user: { _id, fullName, email, avatar, role }
}
```

## Database Migration Notes
إذا كان لديك بيانات موجودة:
1. انسخ المستخدمين الذين لديهم `role: "admin"` إلى جدول Admin
2. أزل حقل `role` من جدول User
3. حدّث `createdBy` في Task ليشير إلى IDs من Admin بدلاً من User

## Testing
```bash
# Seed database مع البيانات الجديدة
npm run seed

# الاختبار:
1. تسجيل دخول الأدمن: admin@example.com / password123
2. تسجيل دخول المستخدم: alice@example.com / password123
3. تحقق من أن الأدمن يمكنه إنشاء المهام
4. تحقق من أن المستخدم يمكنه رؤية مهامه فقط
```
