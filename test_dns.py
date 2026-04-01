import socket
try:
    print(socket.gethostbyname('generativelanguage.googleapis.com'))
except Exception as e:
    print(f"Error: {e}")
