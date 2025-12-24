# Environment Variables Setup

Create a `.env` file in the `Kira-Backend` directory with the following variables:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# JWT Secret
JWT_SECRET=your_jwt_secret_key

# Server
PORT=5000
CLIENT_URL=http://localhost:5173

# OpenAI API Key (required for Assistant)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# Frontend API URL (optional, defaults to http://localhost:5000/api)
# VITE_API_URL=http://localhost:5000/api
```

## Required for Assistant:
- `OPENAI_API_KEY`: Your OpenAI API key (get it from https://platform.openai.com/api-keys)
- `OPENAI_MODEL`: Model to use (default: `gpt-4o-mini` for low cost)

## Frontend:
Create a `.env` file in `Kira-Frontend` directory:
```env
VITE_API_URL=http://localhost:5000/api
```

