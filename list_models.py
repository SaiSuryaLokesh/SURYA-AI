from google import genai
try:
    client = genai.Client(api_key="AIzaSyBjnraEhtzjw5nu_tNuKbWqdfuiSYNZeDI")
    for m in client.models.list():
        print(m.name)
except Exception as e:
    print("Error:", e)
