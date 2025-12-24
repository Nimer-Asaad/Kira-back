# Kira

## Kira Public Assistant (Level A)

### Enabling LLM Provider (Optional)
The assistant can optionally use an LLM (e.g., OpenAI) to improve response phrasing. By default, only safe templates and rules are used.

**To enable LLM provider:**
1. Set the following environment variable in your `.env` file:
   
	 ```env
	 ASSISTANT_PROVIDER=openai
	 OPENAI_API_KEY=your-openai-key-here
	 ```
2. The backend will use the LLM only for phrasing, and never send secrets or internal code.
3. If `ASSISTANT_PROVIDER` is not set, the assistant will always use the built-in templates/rules.

**Security:**
- Never include real API keys in public code or documentation.
- The assistant endpoint is protected by authentication and RBAC.

### Endpoint
- `POST /api/assistant/public` (protected, all authenticated users)
- Body: `{ mode, message, context }`

### Modes
- `help`: Page-specific help and guidance
- `tasks`: Task summary and tips
- `draft`: Generate draft email/message text
- `general`: General product Q&A

### Example context object
```json
{
	"routeKey": "tasks",
	"role": "admin"
}
```

### Rate Limiting
- Each user is limited to 10 assistant requests per minute.

### Logging
- Only minimal errors are logged. No message content is stored.