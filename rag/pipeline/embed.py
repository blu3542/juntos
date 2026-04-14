import os
import time
import openai


def _get_client() -> openai.OpenAI:
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPEN_AI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set in environment")
    return openai.OpenAI(api_key=api_key)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of strings using text-embedding-3-small (1536 dims).

    Batches into chunks of 500 to stay within token limits.
    Retries up to 3 times on RateLimitError with exponential backoff.
    """
    client = _get_client()
    results: list[list[float]] = []
    batch_size = 500

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        for attempt in range(3):
            try:
                response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=batch,
                )
                # Response preserves input order
                results.extend([item.embedding for item in response.data])
                break
            except openai.RateLimitError:
                if attempt == 2:
                    raise
                wait = 2 ** attempt
                print(f"  Rate limited — retrying in {wait}s...")
                time.sleep(wait)

    return results
