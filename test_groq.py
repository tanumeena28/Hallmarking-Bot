import os
from dotenv import load_dotenv
from groq import Groq

# Load .env file
load_dotenv()

print('LLM_PROVIDER:', os.getenv('LLM_PROVIDER'))
print('API Key Available:', bool(os.getenv('GROQ_API_KEY')))

client = Groq(api_key=os.getenv('GROQ_API_KEY'))

try:
    res = client.chat.completions.create(
        model='llama-3.3-70b-versatile',
        messages=[{'role': 'user', 'content': 'What is XRF testing?'}]
    )
    print("\nResponse from Groq:")
    print(res.choices[0].message.content[:300])
except Exception as e:
    print(f"\nError calling Groq: {e}")