import os
from dotenv import load_dotenv
load_dotenv('../.env')
print('LLM_PROVIDER:', os.getenv('LLM_PROVIDER'))
from groq import Groq
client = Groq(api_key=os.getenv('GROQ_API_KEY'))
res = client.chat.completions.create(
    model='llama-3.3-70b-versatile',
    messages=[{'role': 'user', 'content': 'What is XRF testing?'}]
)
print(res.choices[0].message.content[:300])