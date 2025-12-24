# Kira Public Assistant – Manual Test Checklist

## Backend
- [ ] `/api/assistant/public` endpoint returns 401 for unauthenticated users
- [ ] Validates input: rejects invalid mode, too short/long message, or bad context
- [ ] Enforces RBAC: user only sees their own tasks (unless HR/Admin)
- [ ] Rate limit: more than 10 requests/min returns error
- [ ] Sanitizes tokens/keys in user message
- [ ] LLM provider (if enabled) does not leak secrets or code

## Frontend
- [ ] Assistant button appears for all authenticated users (HR/Admin/Trainee/User)
- [ ] Modal opens and closes correctly
- [ ] Tabs switch modes: Help, Tasks, Draft, General
- [ ] Suggestions appear and auto-fill input
- [ ] Context badge shows correct page (e.g., Tasks, Inbox)
- [ ] User can send and receive messages in all modes
- [ ] Draft mode returns structured draft (subject/body/tips)
- [ ] Assistant replies in same language as user input (Arabic/English)
- [ ] No code, secrets, or internal details are shown in any reply

## Security
- [ ] No internal endpoints, tokens, or code are exposed in UI or API
- [ ] Only allowed data is returned per user role

---

**Note:** For LLM, test with and without `ASSISTANT_PROVIDER` set in `.env`.
