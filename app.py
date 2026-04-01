from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
import os
import faiss
import numpy as np
import pypdf

app = Flask(__name__)
CORS(app)

# Initialize Gemini Client
client = genai.Client(api_key="AIzaSyBjnraEhtzjw5nu_tNuKbWqdfuiSYNZeDI")
MODEL_NAME = "gemini-2.5-flash"
EMBEDDING_MODEL = "gemini-embedding-001"

# In-memory allocation for 6 chat sessions
sessions = {}
session_dbs = {}
session_chunks = {}
NUM_SESSIONS = 6

def init_sessions():
    for i in range(1, NUM_SESSIONS + 1):
        sessions[str(i)] = client.chats.create(model=MODEL_NAME)
        session_dbs[str(i)] = None
        session_chunks[str(i)] = []

init_sessions()

def chunk_text(text, chunk_size=1000, overlap=100):
    chunks = []
    # simple chunking with overlap
    for i in range(0, len(text), chunk_size - overlap):
        chunks.append(text[i:i+chunk_size])
    return chunks

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    session_id = request.form.get('session_id')
    
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    if file and file.filename.endswith('.pdf'):
        try:
            reader = pypdf.PdfReader(file)
            text = ""
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"

            if not text.strip():
                return jsonify({'error': 'Could not extract text from PDF.'}), 400

            chunks = chunk_text(text)
            
            # Create embeddings
            embeddings = []
            for chunk in chunks:
                emb_res = client.models.embed_content(
                    model=EMBEDDING_MODEL, 
                    contents=chunk
                )
                embeddings.append(emb_res.embeddings[0].values)
            
            emb_matrix = np.array(embeddings).astype('float32')
            
            # Create FAISS index
            dimension = emb_matrix.shape[1]
            index = faiss.IndexFlatL2(dimension)
            index.add(emb_matrix)
            
            session_dbs[session_id] = index
            session_chunks[session_id] = chunks
            
            return jsonify({'message': f'Successfully verified using RAG.'})
        except Exception as e:
            print(f"Error processing PDF: {e}")
            return jsonify({'error': str(e)}), 500
            
    return jsonify({'error': 'Invalid file format. Only PDF allowed.'}), 400

@app.route('/api/chat/<session_id>', methods=['POST'])
def chat(session_id):
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400

    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400

        user_message = data['message']
        augmented_prompt = user_message

        # Perform RAG retrieval if a PDF was uploaded
        if session_dbs[session_id] is not None:
            question_emb_res = client.models.embed_content(
                model=EMBEDDING_MODEL, 
                contents=user_message
            )
            question_emb = np.array([question_emb_res.embeddings[0].values]).astype('float32')
            
            # Search top 3 chunks
            k = min(3, len(session_chunks[session_id]))
            D, I = session_dbs[session_id].search(question_emb, k)
            
            context_pieces = [session_chunks[session_id][i] for i in I[0] if i != -1]
            if context_pieces:
                context_str = "\n\n".join(context_pieces)
                augmented_prompt = f"Context from uploaded PDF:\n{context_str}\n\nUser Question:\n{user_message}\n\nPlease answer the question primarily using the provided context."

        chat_session = sessions[session_id]
        response = chat_session.send_message(augmented_prompt)

        return jsonify({'reply': response.text})

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/history/<session_id>', methods=['GET'])
def history(session_id):
    if session_id not in sessions:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    chat_session = sessions[session_id]
    history_list = []
    
    try:
        if hasattr(chat_session, 'history') and chat_session.history:
            for message in chat_session.history:
                role = message.role
                content = ""
                
                if hasattr(message, 'parts'):
                    for part in message.parts:
                        if hasattr(part, 'text'):
                            content += part.text
                        elif isinstance(part, str):
                            content += part
                elif hasattr(message, 'text'):
                    content = message.text
                else:
                    content = str(message)
                
                # Sanitize augmented RAG prompt for the UI
                if role == 'user' and "Context from uploaded PDF:" in content:
                    try:
                        content = content.split("User Question:\n")[1].split("\n\nPlease answer")[0]
                    except:
                        pass
                
                history_list.append({'role': 'user' if role == 'user' else 'ai', 'content': content})
    except Exception as e:
        print(f"Error extracting history: {e}")
        
    return jsonify({'history': history_list})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
