# KNOWRA AI service

FastAPI service used by the backend for doubt explanations, prerequisite-gap detection, and learning-plan tips.

## Setup

Use Python 3.10 or newer. From this directory, create and activate a virtual environment, then install the requirements:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Create a local `.env` file with your Groq credentials. Do not commit `.env` or `venv`.

```text
GROQ_API_KEY=your-groq-api-key
GROQ_MODEL=your-supported-groq-model
AI_SERVICE_KEY=optional-shared-bearer-key
```

Run the API from this directory:

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend can use `http://localhost:8000` as `AI_SERVICE_URL`. If `AI_SERVICE_KEY` is configured here, set the same value in the backend.

## Endpoints

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `POST /analyze` | Return an explanation and up to three prerequisite concepts |
| `POST /learning/plan` | Rank gaps and generate a tip and practice question per ranked concept |

Both POST endpoints use the optional `Authorization: Bearer <AI_SERVICE_KEY>` check.

`POST /analyze` accepts `{ "subject", "topic", "text" }`. Gap names are short textbook labels, normally two to four words, with severity `low`, `medium`, or `high`.

`POST /learning/plan` accepts at most 50 gaps:

```json
{
  "gaps": [
    {
      "concept": "Refractive index",
      "severity": "high",
      "occurrences": 3,
      "days_since_last_seen": 4
    }
  ],
  "limit": 5
}
```

The `limit` defaults to 5 and must be from 1 to 10. Each concept is ranked by `severityWeight * occurrences / (1 + days_since_last_seen / 14)`, with severity weights 1, 2, and 3. The service uses the LLM only to generate one tip (maximum 30 words) and one practice question per ranked concept. Concept strings are passed as untrusted data, not instructions. Provider or structured-output failures return HTTP 502.

## Tests

The pytest suite mocks the LLM and does not make Groq requests:

```powershell
python -m pytest
```
