import os
import requests
from langchain_core.embeddings import Embeddings

class HuggingFaceAPIEmbeddings(Embeddings):
    def __init__(self, model: str = "sentence-transformers/all-MiniLM-L6-v2", api_token: str = None):
        self.model = model
        self.api_token = api_token
        self.api_url = f"https://router.huggingface.co/hf-inference/models/{model}/pipeline/feature-extraction"
        self.headers = {"Authorization": f"Bearer {api_token}"} if api_token else {}

    def _embed(self, texts: list[str]) -> list[list[float]]:
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    self.api_url,
                    headers=self.headers,
                    json={"inputs": texts, "options": {"wait_for_model": True}},
                    timeout=60
                )
                
                # Check for 503 loading state
                if response.status_code == 503:
                    wait_time = 5
                    try:
                        err_json = response.json()
                        if "estimated_time" in err_json:
                            wait_time = min(float(err_json["estimated_time"]), 15.0)
                    except:
                        pass
                    print(f"Hugging Face model is loading. Waiting {wait_time}s... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(wait_time)
                    continue
                    
                if response.status_code != 200:
                    raise Exception(f"HuggingFace API error ({response.status_code}): {response.text}")
                
                result = response.json()
                if isinstance(result, list):
                    # If it's a 1D list of floats, wrap it in a nested list
                    if len(result) > 0 and isinstance(result[0], float):
                        return [result]
                    # If it's a 2D list of list of floats, return it directly
                    if len(result) > 0 and isinstance(result[0], list):
                        return result
                raise Exception(f"Unexpected response format from HuggingFace: {result}")
                
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                if attempt < max_retries - 1:
                    print(f"Hugging Face connection timeout/error ({e}), retrying in 3s... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(3)
                    continue
                raise
            except Exception as e:
                print(f"Error calling HuggingFace API: {e}")
                if attempt < max_retries - 1:
                    print(f"Retrying in 3s...")
                    time.sleep(3)
                    continue
                raise

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # Hugging Face API has limits on batch size, so we send in batches of 32
        batch_size = 32
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            embeddings.extend(self._embed(batch))
        return embeddings

    def embed_query(self, text: str) -> list[float]:
        res = self._embed([text])
        return res[0]

def get_embeddings():
    hf_token = os.getenv("HUGGINGFACEHUB_API_TOKEN")
    if hf_token:
        print("Using Cloud-based Hugging Face API Embeddings (Memory Optimized)")
        return HuggingFaceAPIEmbeddings(api_token=hf_token)
    else:
        print("Using Local Hugging Face Embeddings (Default)")
        # Lazy-load to avoid importing torch/transformers on start if not needed
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
