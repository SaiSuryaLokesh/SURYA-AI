import traceback
from google import genai
try:
    client = genai.Client(api_key="AIzaSyBjnraEhtzjw5nu_tNuKbWqdfuiSYNZeDI")
    res = client.models.embed_content(
        model="embedding-001", 
        contents="Hello world"
    )
    print("Success! Embedding length:", len(res.embeddings[0].values))
except Exception as e:
    print("Exception!")
    traceback.print_exc()
