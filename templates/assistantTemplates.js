// Templates for help, drafts, FAQ
exports.getHelpText = (routeKey, role) => {
  const help = {
    dashboard: {
      admin: 'Dashboard: View stats, recent tasks, and team activity.',
      hr: 'Dashboard: إحصائيات ومهام حديثة لفريق الموارد البشرية.',
      trainee: 'Dashboard: راقب تقدمك ومهامك الحالية.',
      company: 'Dashboard: Company overview and key metrics.'
    },
    tasks: {
      admin: 'Tasks: Manage, assign, and track all tasks. Use filters to find overdue or high priority tasks.',
      hr: 'Tasks: راقب مهام المتدربين وحدد الأولويات.',
      trainee: 'Tasks: اعرض مهامك، تحقق من المواعيد النهائية، وحدث الحالة.',
      company: 'Tasks: View company-wide tasks and statuses.'
    },
    inbox: {
      admin: 'Inbox: Check synced emails, reply, and manage labels.',
      hr: 'Inbox: راقب البريد الوارد، صنف الرسائل، وفعّل المزامنة.',
      trainee: 'Inbox: استقبل رسائل الإدارة وتواصل مع الفريق.',
      company: 'Inbox: Company email overview.'
    },
    users: {
      admin: 'Users: Add, edit, or remove team members.',
      hr: 'Users: إدارة بيانات المتدربين.',
      trainee: 'Users: عرض معلوماتك الشخصية فقط.',
      company: 'Users: Manage company users.'
    },
    settings: {
      admin: 'Settings: Configure system preferences and integrations.',
      hr: 'Settings: إعدادات الموارد البشرية.',
      trainee: 'Settings: إعدادات الحساب الشخصي.',
      company: 'Settings: إعدادات الشركة.'
    },
    reports: {
      admin: 'Reports: Generate and download reports.',
      hr: 'Reports: تقارير أداء المتدربين.',
      trainee: 'Reports: عرض تقاريرك الشخصية.',
      company: 'Reports: Company performance reports.'
    },
    other: {
      admin: 'Use the menu to navigate.',
      hr: 'استخدم القائمة للتنقل.',
      trainee: 'استخدم القائمة للتنقل.',
      company: 'Use the menu to navigate.'
    }
  };
  return help[routeKey]?.[role] || help.other[role] || 'How can I help you?';
};

exports.getDraftTemplate = (draftType, fields = {}, language = 'en', tone = 'normal') => {
  // Only safe, generic templates
  const templates = {
    email_supplier_damage: {
      en: {
        subject: 'Report: Damaged Goods',
        body: `Dear ${fields.name || 'Supplier'},\n\nWe received order ${fields.orderId || ''} with some damaged items. Please advise on next steps.\n\nBest regards,\n${fields.company || ''}`,
        tips: 'Review attached photos before sending.'
      },
      ar: {
        subject: 'إبلاغ عن تلف شحنة',
        body: `السيد/ة ${fields.name || 'المورد'}،\n\nتم استلام الطلبية رقم ${fields.orderId || ''} مع وجود تلفيات. نرجو إفادتنا بالإجراء المناسب.\n\nتحياتنا،\n${fields.company || ''}`,
        tips: 'أرفق صور التلفيات قبل الإرسال.'
      }
    },
    email_followup: {
      en: {
        subject: 'Follow-up Request',
        body: `Hello ${fields.name || ''},\n\nJust following up regarding ${fields.reason || 'our previous discussion'}.\n\nThank you,\n${fields.company || ''}`,
        tips: 'Be polite and concise.'
      },
      ar: {
        subject: 'متابعة طلب',
        body: `مرحباً ${fields.name || ''}،\n\nأتابع بخصوص ${fields.reason || 'الموضوع السابق'}.\n\nشكراً،\n${fields.company || ''}`,
        tips: 'كن مهذباً ومختصراً.'
      }
    },
    message_late: {
      en: {
        body: `Hi ${fields.name || ''},\n\nI will be late due to ${fields.reason || 'an urgent matter'}.\n\nThanks for understanding.`,
        tips: 'Notify as early as possible.'
      },
      ar: {
        body: `مرحباً ${fields.name || ''}،\n\nسأتأخر بسبب ${fields.reason || 'ظرف طارئ'}.\n\nشكراً لتفهمك.`,
        tips: 'أبلغ في أقرب وقت.'
      }
    },
    message_interview_invite: {
      en: {
        body: `Dear ${fields.name || ''},\n\nYou are invited for an interview on ${fields.time || '[date/time]'}.\n\nBest regards,\n${fields.company || ''}`,
        tips: 'Confirm time and location.'
      },
      ar: {
        body: `السيد/ة ${fields.name || ''}،\n\nندعوك لمقابلة عمل بتاريخ ${fields.time || '[التاريخ/الوقت]'}.\n\nتحياتنا،\n${fields.company || ''}`,
        tips: 'أكد الوقت والمكان.'
      }
    }
  };
  const lang = language === 'ar' ? 'ar' : 'en';
  const tpl = templates[draftType]?.[lang];
  if (!tpl) return { body: 'Draft type not supported.', tips: '' };
  return tpl;
};

exports.getFAQ = (message, context) => {
  // Simple FAQ, no code details
  const faqs = [
    { q: /what.*kira/i, a: 'Kira is a platform for managing tasks, emails, and team collaboration.' },
    { q: /كيف أستخدم كيرا/i, a: 'كيرا منصة لإدارة المهام والبريد والتعاون بين الفريق.' },
    { q: /features|مميزات/i, a: 'Features: task management, email sync, dashboards, and more.' },
    { q: /reset.*password|نسيت.*كلمة/i, a: 'Use the profile page to reset your password.' },
    { q: /contact.*support|دعم/i, a: 'Contact your admin or HR for support.' }
  ];
  for (const faq of faqs) {
    if (faq.q.test(message)) return faq.a;
  }
  return 'How can I help you?';
};
